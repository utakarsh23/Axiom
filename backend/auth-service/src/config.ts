import dotenv from 'dotenv';
dotenv.config();

const config = {
  mongo: {
    uri: process.env.MONGO_URI ?? 'mongodb://localhost:27017/auth-service',
  },
  github: {
    clientId:     process.env.GITHUB_CLIENT_ID ?? '',
    clientSecret: process.env.GITHUB_CLIENT_SECRET ?? '',
    // URL GitHub redirects to after user authorises — must match GitHub App settings
    callbackUrl:  process.env.GITHUB_CALLBACK_URL ?? 'http://localhost:8080/auth/github/callback',
  },
  jwt: {
    secret:    process.env.JWT_SECRET ?? 'change-this-secret-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  },
  // Frontend URL — used to redirect after successful login with token
  clientUrl: process.env.CLIENT_URL ?? 'http://localhost:3000',
  port:      parseInt(process.env.PORT ?? '8080', 10),
  nodeEnv:   process.env.NODE_ENV ?? 'development',
  logLevel:  process.env.LOG_LEVEL ?? 'info',
};

export { config };