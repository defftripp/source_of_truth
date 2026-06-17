# Authentication via Google OAuth

Guide for implementing Google OAuth login/registration in any project.

---

## 1. Flow Overview

```
1. User clicks "Sign in with Google"
2. Frontend fetches Google auth URL from backend
3. Frontend redirects user to Google consent screen
4. Google redirects back to backend callback URL with ?code=XXX
5. Backend redirects to frontend callback page with the code
6. Frontend POSTs code to backend
7. Backend exchanges code with Google for user info
8. Backend creates/updates user, generates JWT tokens, returns them
9. Frontend stores tokens in localStorage, updates auth state
```

---

## 2. Environment Variables

```env
# Google OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:8000/api/auth/google/callback

# JWT
JWT_SECRET_KEY=change-me-in-production
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=30

# Frontend
FRONTEND_URL=http://localhost:3000
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
```

Get credentials from [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → OAuth 2.0 Client IDs.

---

## 3. Database Schema

### 3.1 `users` table

```sql
CREATE TABLE users (
    id              SERIAL PRIMARY KEY,
    email           VARCHAR(255) UNIQUE NOT NULL,
    name            VARCHAR(255),
    profile_picture VARCHAR(500),
    google_id       VARCHAR(255) UNIQUE,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 3.2 `user_tokens` table

```sql
CREATE TABLE user_tokens (
    id                        SERIAL PRIMARY KEY,
    user_id                   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    access_token              TEXT NOT NULL,
    expires_at                TIMESTAMP NOT NULL,
    refresh_token             TEXT UNIQUE NOT NULL,
    refresh_token_expires_at  TIMESTAMP NOT NULL,
    created_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

User creation is an upsert — `INSERT ... ON CONFLICT (email) DO UPDATE`. First login creates the user, subsequent logins update name/picture.

---

## 4. Backend

### 4.1 Libraries

- **python-jose[cryptography]** — JWT encoding/decoding (HS256)
- **httpx** — async HTTP calls to Google APIs
- No third-party OAuth library needed — the flow is simple enough to do manually.

### 4.2 API Endpoints

| Method | Path                          | Auth     | Purpose                              |
|--------|-------------------------------|----------|--------------------------------------|
| GET    | `/auth/google/login`          | No       | Returns Google authorization URL     |
| GET    | `/auth/google/callback`       | No       | Redirects Google → frontend with code |
| POST   | `/auth/google/callback`       | No       | Exchanges code for JWT tokens        |
| POST   | `/auth/refresh`               | No       | Refresh expired access token         |
| GET    | `/auth/me`                    | Yes      | Current user info                    |
| POST   | `/auth/logout`                | Yes      | Revoke tokens                        |

### 4.3 Google OAuth exchange

```python
# Step 1: Generate auth URL
def get_google_auth_url() -> str:
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "select_account",
    }
    return f"https://accounts.google.com/o/oauth2/auth?{urlencode(params)}"

# Step 2: Exchange code for user info
async def exchange_google_code(code: str) -> dict:
    # Exchange code for Google access token
    token_resp = await httpx.post("https://oauth2.googleapis.com/token", data={
        "code": code,
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "grant_type": "authorization_code",
    })
    access_token = token_resp.json()["access_token"]

    # Fetch user profile
    user_resp = await httpx.get("https://www.googleapis.com/oauth2/v2/userinfo",
        headers={"Authorization": f"Bearer {access_token}"})
    return user_resp.json()  # {email, name, picture, id}
```

### 4.4 JWT tokens

```python
from jose import jwt

def create_access_token(email: str) -> str:
    payload = {
        "sub": email,
        "exp": datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm="HS256")

def create_refresh_token(email: str) -> str:
    payload = {
        "sub": email,
        "exp": datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
        "type": "refresh",
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm="HS256")

def verify_token(token: str) -> str | None:
    payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=["HS256"])
    return payload.get("sub")  # email
```

Both tokens stored in `user_tokens` table so they can be revoked on logout.

### 4.5 Route protection

```python
from fastapi.security import OAuth2PasswordBearer

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token", auto_error=False)

async def get_current_user(token: str = Depends(oauth2_scheme)) -> User | None:
    if not token:
        return None
    email = verify_token(token)
    return await db.get_user_by_email(email)

async def require_user(user: User | None = Depends(get_current_user)) -> User:
    if not user:
        raise HTTPException(status_code=401)
    return user

# Usage
@router.get("/protected")
async def protected_route(user: User = Depends(require_user)):
    ...
```

Two levels:
- `get_current_user` — optional auth (returns None if no token).
- `require_user` — mandatory auth (raises 401).

### 4.6 GET callback → redirect to frontend

The GET callback just passes `code` and `state` to the frontend page:

```python
@router.get("/auth/google/callback")
async def google_callback_redirect(code: str, state: str | None = None):
    redirect_url = f"{FRONTEND_URL}/auth/google/callback?code={code}"
    if state:
        redirect_url += f"&state={state}"
    return RedirectResponse(url=redirect_url)
```

The actual token exchange happens via POST from the frontend callback page.

---

## 5. Frontend

### 5.1 Auth Context

Provide global auth state via React Context:

```typescript
interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signIn: () => Promise<void>;    // Redirect to Google
  logout: () => Promise<void>;    // Clear tokens
  refreshUser: () => Promise<void>;
}
```

On app load, try to fetch `/auth/me`. If 401, try refresh token. If that fails too, clear state.

### 5.2 Token storage

```typescript
localStorage.setItem("access_token", token);
localStorage.setItem("refresh_token", refreshToken);
```

Attach to every API request:

```typescript
headers: { "Authorization": `Bearer ${localStorage.getItem("access_token")}` }
```

### 5.3 Auto-refresh on 401

When any API call returns 401:
1. Call `POST /auth/refresh` with stored refresh token.
2. Store new tokens.
3. Retry the original request.
4. If refresh fails — clear tokens, redirect to `/login`.

### 5.4 Callback page (`/auth/google/callback`)

```
1. Extract `code` from URL search params
2. POST to `/auth/google/callback` with { code }
3. Store returned tokens
4. Update auth context
5. Redirect to home page
```

Show a loading spinner while exchanging. Show error state if it fails.

### 5.5 Login page (`/login`)

- "Sign in with Google" button.
- On click: fetch auth URL from backend, then `window.location.href = url`.
- If already authenticated, redirect to home.

---

## 6. Token Refresh Flow

```
Access token: 60 min (short-lived)
Refresh token: 30 days (long-lived)
```

1. Frontend gets 401 on any request.
2. Sends refresh token to `POST /auth/refresh`.
3. Backend verifies refresh JWT + checks it exists in DB and is not expired.
4. Backend generates new access + refresh token pair.
5. Old token row updated with new tokens in DB.
6. Frontend stores new tokens, retries original request.

Refresh token rotation — a new refresh token is issued on every refresh, old one is invalidated.

---

## 7. Checklist for New Projects

- [ ] Create Google OAuth credentials in Cloud Console
- [ ] Create `users` table with email, name, profile_picture, google_id
- [ ] Create `user_tokens` table with access/refresh tokens and expiration
- [ ] Implement auth URL generation endpoint
- [ ] Implement GET callback (redirect Google → frontend)
- [ ] Implement POST callback (exchange code → JWT tokens)
- [ ] Implement token refresh endpoint
- [ ] Implement `/auth/me` endpoint
- [ ] Implement logout (delete tokens from DB)
- [ ] Add `get_current_user` / `require_user` dependencies for route protection
- [ ] Build AuthContext on frontend with auto-refresh on 401
- [ ] Build `/login` page with Google button
- [ ] Build `/auth/google/callback` page
- [ ] Store tokens in localStorage, attach Bearer header to all requests
