import { Router } from 'express';
import { redirectToGitHub, githubCallback, verifyToken, getMe } from '../controller/authController';

const router = Router();

// ─── OAuth routes (public) ───────────────────────────────────────────────────
router.get('/auth/github',          redirectToGitHub);
router.get('/auth/github/callback', githubCallback);

// ─── NGINX auth_request endpoint ────────────────────────────────────────────
router.get('/auth/verify', verifyToken);

// ─── Protected user routes ───────────────────────────────────────────────────
router.get('/auth/me', getMe);

export { router };