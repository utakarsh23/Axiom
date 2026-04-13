import { Request, Response } from 'express';
import { handleGitHubCallback, verifyJwt } from '../services/authService';
import { config } from '../config';
import { UserModel } from '../model/userModel';
import logger from '../logger';

// Step 1 — redirect user to GitHub authorisation page
const redirectToGitHub = (_req: Request, res: Response): void => {
  const params = new URLSearchParams({
    client_id:    config.github.clientId,
    redirect_uri: config.github.callbackUrl,
    scope:        'read:user user:email',
  });

  res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
};

// Step 2 — GitHub redirects here with a one-time code
// Exchange code → access token → GitHub profile → upsert user → issue JWT → redirect frontend
const githubCallback = async (req: Request, res: Response): Promise<void> => {
  try {
    const code = req.query.code as string;
    const { token } = await handleGitHubCallback(code);

    // Send token to frontend via redirect — frontend stores in memory or secure cookie
    res.redirect(`${config.clientUrl}/auth/success?token=${token}`);
  } catch (err: any) {
    logger.error({ err }, 'GitHub OAuth callback failed');
    res.redirect(`${config.clientUrl}/auth/error`);
  }
};

// Called by NGINX auth_request on every protected upstream request.
// Returns 200 + x-user-id header on valid token — NGINX injects header into upstream.
// Returns 401 on invalid or missing token — NGINX blocks the request.
const verifyToken = (req: Request, res: Response): void => {
  try {
    const authHeader = req.headers['authorization'];

    // Primary: read from Authorization header
    // Fallback: read from `token` cookie (set by frontend during login)
    let token = '';
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    } else if (req.headers.cookie) {
      const match = req.headers.cookie.match(/(?:^|;\s*)token=([^;]+)/);
      if (match) token = match[1];
    }

    if (!token) {
      res.status(401).json({ error: 'Authorization header or token cookie missing' });
      return;
    }

    const payload = verifyJwt(token);

    // NGINX reads this via auth_request_set $user_id and injects x-user-id downstream
    res.setHeader('x-user-id', payload.userId);
    res.status(200).json({ userId: payload.userId });
  } catch (err: any) {
    res.status(err.status ?? 401).json({ error: err.message });
  }
};

// Returns the current authenticated user's profile.
// Frontend calls this after login to display user info.
const getMe = async (req: Request, res: Response): Promise<void> => {
  try {
    const authHeader = req.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authorization header missing' });
      return;
    }

    const token   = authHeader.slice(7);
    const payload = verifyJwt(token);

    const user = await UserModel.findById(payload.userId).lean();

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ user });
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message });
  }
};

export { redirectToGitHub, githubCallback, verifyToken, getMe };