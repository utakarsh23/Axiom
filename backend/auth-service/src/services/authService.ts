import axios from 'axios';
import jwt from 'jsonwebtoken';
import { UserModel, IUser } from '../model/userModel';
import { config } from '../config';
import logger from '../logger';

// Shape of the GitHub OAuth access token response
interface GitHubTokenResponse {
  access_token?: string;   // undefined when GitHub returns an error
  token_type?:   string;
  scope?:        string;
  error?:        string;   // GitHub returns 200 + error field on failure
  error_description?: string;
}

// Shape of the GitHub user profile response
interface GitHubProfile {
  id:         number;
  login:      string;
  email:      string | null;
  avatar_url: string;
}

// Shape of the JWT payload we issue — read by NGINX auth_request handler
interface JwtPayload {
  userId:    string;   // MongoDB _id of the user
  githubId:  string;
  username:  string;
}

// Exchanges GitHub OAuth code for an access token
const exchangeCodeForToken = async (code: string): Promise<string> => {
  try {
    const response = await axios.post<GitHubTokenResponse>(
      'https://github.com/login/oauth/access_token',
      {
        client_id:     config.github.clientId,
        client_secret: config.github.clientSecret,
        code,
        redirect_uri:  config.github.callbackUrl,
      },
      // GitHub returns JSON only if we explicitly request it
      { headers: { Accept: 'application/json' } }
    );

    // GitHub returns HTTP 200 even on failure — must check the body for error field
    if (response.data.error || !response.data.access_token) {
      throw new Error(response.data.error_description ?? response.data.error ?? 'GitHub token exchange failed');
    }

    return response.data.access_token;
  } catch (err) {
    logger.error({ err }, 'Failed to exchange GitHub code for access token');
    throw err;
  }
};

// Fetches the authenticated user's profile from GitHub API
const fetchGitHubProfile = async (accessToken: string): Promise<GitHubProfile> => {
  try {
    const response = await axios.get<GitHubProfile>('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
      },
    });
    return response.data;
  } catch (err) {
    logger.error({ err }, 'Failed to fetch GitHub user profile');
    throw err;
  }
};

// Fetches the user's primary email if not present on the profile
// GitHub users with private emails require a separate /user/emails call
const fetchGitHubEmail = async (accessToken: string): Promise<string> => {
  try {
    const response = await axios.get<{ email: string; primary: boolean; verified: boolean }[]>(
      'https://api.github.com/user/emails',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github+json',
        },
      }
    );
    const primary = response.data.find((e) => e.primary && e.verified);

    // If no verified primary email found, we cannot store the user — throw hard
    if (!primary?.email) {
      throw Object.assign(new Error('No verified primary email found on GitHub account'), { status: 400 });
    }

    return primary.email;
  } catch (err) {
    logger.error({ err }, 'Failed to fetch GitHub user emails');
    throw err;
  }
};

// Upserts the user record in MongoDB.
// Uses githubId as the stable key — username and email may change over time.
const upsertUser = async (profile: GitHubProfile, email: string): Promise<IUser> => {
  let user;

  try {
    user = await UserModel.findOneAndUpdate(
      { githubId: String(profile.id) },
      {
        githubId:  String(profile.id),
        username:  profile.login,
        email,
        avatarUrl: profile.avatar_url,
      },
      { upsert: true, new: true }
    );
  } catch (err) {
    logger.error({ err, githubId: profile.id }, 'Failed to upsert user');
    throw err;
  }

  // Checked outside catch — not a DB error, just a defensive guard
  if (!user) {
    throw new Error('Failed to upsert user — findOneAndUpdate returned null');
  }

  return user;
};

// Issues a signed JWT containing userId, githubId, and username.
// NGINX auth_request calls /auth/verify which decodes this to get userId.
const issueJwt = (user: IUser): string => {
  const payload: JwtPayload = {
    userId:   String(user._id),
    githubId: user.githubId,
    username: user.username,
  };

  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn as jwt.SignOptions['expiresIn'],
  });
};

// Full OAuth callback flow:
// code → access token → GitHub profile → upsert user → issue JWT
const handleGitHubCallback = async (code: string): Promise<{ token: string; user: IUser }> => {
  if (!code) {
    throw Object.assign(new Error('OAuth code is required'), { status: 400 });
  }

  const accessToken = await exchangeCodeForToken(code);
  const profile     = await fetchGitHubProfile(accessToken);

  // Use profile email if available, otherwise fetch from /user/emails
  const email = profile.email ?? await fetchGitHubEmail(accessToken);

  const user  = await upsertUser(profile, email);
  const token = issueJwt(user);

  logger.info({ userId: String(user._id), username: user.username }, 'User authenticated');

  return { token, user };
};

// Verifies a JWT and returns the decoded payload.
// Called by the /auth/verify endpoint which NGINX uses for auth_request.
const verifyJwt = (token: string): JwtPayload => {
  try {
    const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload;
    return decoded;
  } catch (err) {
    throw Object.assign(new Error('Invalid or expired token'), { status: 401 });
  }
};

export { handleGitHubCallback, verifyJwt, JwtPayload };