# Auth Service

Handles GitHub OAuth and JWT issuance. The only service responsible for authentication — all other services are completely auth-unaware.

**Port:** `8080`

---

## Responsibilities

- GitHub OAuth 2.0 flow — redirect, code exchange, access token, user profile fetch
- Create or update a user record on every login (upsert by `githubId`)
- Issue a signed JWT containing `userId`, `githubId`, `username`
- Expose `GET /auth/verify` — called by NGINX `auth_request` before every protected upstream request
- Serve current user profile via `GET /auth/me`

---

## Architecture

```
Frontend
  │
  │  GET /auth/github
  ▼
NGINX ──► Auth Service (8080)
              │  redirects to GitHub
              ▼
          GitHub OAuth
              │  redirects back with ?code=
              ▼
Auth Service /auth/github/callback
  │  exchange code → access token
  │  fetch GitHub profile + email
  │  upsert user in MongoDB
  │  issue JWT
  ▼
Frontend receives JWT via redirect
  /auth/success?token=<jwt>
```

### NGINX auth_request flow (every protected request)

```
Frontend
  │  GET /workspaces   Authorization: Bearer <jwt>
  ▼
NGINX
  │  auth_request → GET /auth/verify   Authorization: Bearer <jwt>
  ▼
Auth Service /auth/verify
  │  verifies JWT
  │  returns 200 + x-user-id header   (or 401)
  ▼
NGINX injects x-user-id into upstream request
  │  proxy_pass → Workspace Service (9000)
  ▼
Workspace Service receives x-user-id — never sees the JWT
```

Auth Service is **only hit for login and token verification**. It is never in the hot path of business logic.

---

## Stack

| Layer | Technology |
|---|---|
| Language | TypeScript (CommonJS) |
| Runtime | Node.js |
| HTTP Server | Express 5 |
| Database | MongoDB via Mongoose |
| HTTP Client | Axios (GitHub API calls) |
| Auth | jsonwebtoken (JWT sign + verify) |
| Logging | Pino |
| Config | dotenv |

---

## Project Structure

```
auth-service/
├── src/
│   ├── index.ts                          # Entry point — boot + graceful shutdown
│   ├── config.ts                         # Centralised config from env vars
│   ├── logger.ts                         # Pino logger instance
│   ├── db/
│   │   └── client.ts                     # Mongoose connect / disconnect
│   ├── model/
│   │   └── userModel.ts                  # IUser interface + schema + model
│   ├── services/
│   │   └── authService.ts                # OAuth flow, JWT issue/verify, user upsert
│   ├── controller/
│   │   └── authController.ts             # Request handling, response formatting
│   └── api/
│       └── router.ts                     # Routing only — maps paths to controller
├── package.json
├── tsconfig.json
├── .env
└── .env.example
```

---

## Data Model

**Collection:** `users`
**Unique index:** `githubId`

```typescript
interface IUser {
  githubId:  string;   // GitHub numeric user ID — stable, never changes
  username:  string;   // GitHub login handle
  email:     string;   // verified primary email from GitHub
  avatarUrl: string;   // GitHub avatar URL
  createdAt: Date;
  updatedAt: Date;
}
```

User records are upserted on every login — `githubId` is the key. `username` and `email` are refreshed each time since GitHub users can change them.

---

## HTTP Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | None | Health check |
| `GET` | `/auth/github` | None | Redirect to GitHub OAuth |
| `GET` | `/auth/github/callback` | None | OAuth callback — issues JWT, redirects frontend |
| `GET` | `/auth/verify` | Bearer JWT | NGINX auth_request endpoint |
| `GET` | `/auth/me` | Bearer JWT | Get current user profile |

---

### GET `/auth/github`

Redirects the user to GitHub's authorisation page with `read:user user:email` scopes.

---

### GET `/auth/github/callback?code=...`

GitHub redirects here after the user authorises. Exchanges the code for a GitHub access token, fetches the user profile and verified primary email, upserts the user record, and issues a JWT.

**On success:** redirects to `CLIENT_URL/auth/success?token=<jwt>`
**On failure:** redirects to `CLIENT_URL/auth/error`

---

### GET `/auth/verify`

Called internally by NGINX `auth_request` — not by the frontend directly.

**Headers required:**
```
Authorization: Bearer <jwt>
```

**Response `200`** — token valid
```json
{ "userId": "mongo-objectid" }
```
Also sets response header: `x-user-id: <userId>` — NGINX reads this and injects it into the proxied upstream request.

**Response `401`** — token missing, invalid, or expired
```json
{ "error": "Invalid or expired token" }
```

---

### GET `/auth/me`

**Headers required:**
```
Authorization: Bearer <jwt>
```

**Response `200`**
```json
{
  "user": {
    "_id": "...",
    "githubId": "12345678",
    "username": "utkarshmani",
    "email": "user@example.com",
    "avatarUrl": "https://avatars.githubusercontent.com/..."
  }
}
```

---

## JWT Payload

```typescript
{
  userId:   string;   // MongoDB _id — used by all downstream services
  githubId: string;
  username: string;
  iat:      number;   // issued at
  exp:      number;   // expiry
}
```

Default expiry: `7d` — configurable via `JWT_EXPIRES_IN`.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `MONGO_URI` | `mongodb://localhost:27017/auth-service` | MongoDB connection string |
| `GITHUB_CLIENT_ID` | — | GitHub OAuth App client ID |
| `GITHUB_CLIENT_SECRET` | — | GitHub OAuth App client secret |
| `GITHUB_CALLBACK_URL` | `http://localhost:8080/auth/github/callback` | Must match GitHub App settings |
| `JWT_SECRET` | `change-this-secret-in-production` | Must be a strong random string in production |
| `JWT_EXPIRES_IN` | `7d` | JWT expiry duration |
| `CLIENT_URL` | `http://localhost:3000` | Frontend base URL — used for post-login redirect |
| `PORT` | `8080` | HTTP server port |
| `NODE_ENV` | `development` | Runtime environment |
| `LOG_LEVEL` | `info` | Pino log level |

Generate a strong `JWT_SECRET`:
```bash
openssl rand -base64 64
```

---

## GitHub OAuth App Setup

1. Go to GitHub → Settings → Developer settings → OAuth Apps → New OAuth App
2. Set **Authorization callback URL** to match `GITHUB_CALLBACK_URL`
3. Copy **Client ID** and **Client Secret** into `.env`

---

## Running Locally

**Prerequisites:** MongoDB must be running. GitHub OAuth App must be configured.

```bash
# Install dependencies
npm install

# Development (ts-node + nodemon)
npm run dev

# Production build
npm run build
npm start
```

---

## Boot Sequence

```
connectDB()       → MongoDB ready
app.listen(8080)  → HTTP server accepting requests
```

On `SIGTERM` or `SIGINT`: MongoDB disconnects gracefully before process exits.

---

## Security Notes

- This service must **never** be directly reachable from the internet — only NGINX should talk to it
- All other services must be on an internal Docker network with no exposed ports
- JWT secret must be a cryptographically random string — never a human-readable password
- Token is sent to frontend via redirect query param — frontend must store it in memory or an `HttpOnly` cookie, never `localStorage`
- GitHub OAuth code is single-use — replayed codes are rejected with a clear error message
