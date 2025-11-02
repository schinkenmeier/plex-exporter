# Security Configuration

This document describes the security measures implemented in the backend API.

## Security Headers (Helmet)

The backend uses [Helmet](https://helmetjs.github.io/) to set various HTTP security headers:

### Content Security Policy (CSP)
- `default-src 'self'`: Only allow resources from same origin
- `style-src 'self' 'unsafe-inline'`: Allow inline styles (needed for some frameworks)
- `script-src 'self'`: Only allow scripts from same origin
- `img-src 'self' data: https:`: Allow images from same origin, data URIs, and HTTPS sources

### Other Security Headers
- **Strict-Transport-Security**: Forces HTTPS connections (max-age: 1 year)
- **X-Content-Type-Options**: Prevents MIME-type sniffing attacks
- **X-Frame-Options**: Prevents clickjacking attacks (SAMEORIGIN)
- **Referrer-Policy**: Controls referrer information (no-referrer)
- **X-DNS-Prefetch-Control**: Disables DNS prefetching for privacy
- **Cross-Origin-Resource-Policy**: Configured for cross-origin sharing

## CORS Configuration

Cross-Origin Resource Sharing (CORS) is configured based on environment:

### Development
- **Origin**: `*` (all origins allowed)
- **Credentials**: Enabled
- **Methods**: GET, POST, PUT, DELETE, OPTIONS
- **Allowed Headers**: Content-Type, Authorization
- **Exposed Headers**: RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset
- **Max Age**: 24 hours (preflight cache)

### Production
- **Origin**: Restricted to specific domains:
  - `http://localhost:5500`
  - `http://127.0.0.1:5500`
- All other settings same as development

## Rate Limiting

Three tiers of rate limiting protect against abuse:

### General API Endpoints
- **Limit**: 100 requests per 15 minutes
- **Applies to**: `/api/v1/movies`, `/api/v1/series`, `/api/v1/stats`, `/api/v1/filter`, `/api/v1/recent`
- **Response Headers**:
  - `RateLimit-Limit`: Maximum requests allowed
  - `RateLimit-Remaining`: Requests remaining in window
  - `RateLimit-Reset`: Seconds until window resets

### Search Endpoints
- **Limit**: 30 requests per 1 minute
- **Applies to**: `/api/v1/search`
- **Reason**: More resource-intensive operations

### Hero Pipeline
- **Limit**: 10 requests per 5 minutes
- **Applies to**: `/api/hero/:kind`
- **Reason**: Very resource-intensive (TMDB API calls, complex queries)

### Rate Limit Exceeded Response
```json
{
  "error": "Too Many Requests",
  "message": "You have exceeded the rate limit. Please try again later.",
  "retryAfter": "<timestamp>"
}
```

## Request Body Size Limit

- **Maximum body size**: 10MB
- **Purpose**: Prevent denial-of-service attacks via large payloads

## Input Validation

All query parameters are validated using [Zod](https://github.com/colinhacks/zod):

### Filter Endpoint
- `type`: Must be 'movie' or 'tv'
- `year`: Integer between 1800-2100
- `yearFrom/yearTo`: Integer between 1800-2100
- `search`: String, max 200 characters
- `limit`: Integer between 1-500 (default: 50)
- `offset`: Integer, minimum 0 (default: 0)
- `sortBy`: Must be 'title', 'year', 'added', or 'updated'
- `sortOrder`: Must be 'asc' or 'desc'

### Search Endpoint
- `q`: Required string, 1-200 characters
- `type`: Optional, must be 'movie' or 'tv'
- `limit`: Integer between 1-200 (default: 20)

### Recent Endpoint
- `limit`: Integer between 1-200 (default: 20)
- `type`: Optional, must be 'movie' or 'tv'

Invalid input returns a 400 Bad Request with validation error details.

## Authentication

Protected routes require authentication:
- `/notifications`: Requires auth token
- `/libraries`: Requires auth token

Public routes (no authentication required):
- `/health`: Health check endpoint
- `/api/exports`: Export data endpoints
- `/api/hero`: Hero pipeline endpoints
- `/api/v1/*`: Version 1 API endpoints
- `/media`: Media management endpoints

## Best Practices

### For Frontend Developers
1. Always handle rate limit responses (429 status code)
2. Use `RateLimit-Remaining` header to track available requests
3. Respect `RateLimit-Reset` header for retry timing
4. Keep request payloads under 10MB
5. Validate input on client-side before sending to API

### For Backend Developers
1. Never disable Helmet in production
2. Keep CORS origins restricted in production
3. Review and update CSP directives when adding new dependencies
4. Monitor rate limit metrics for potential abuse patterns
5. Update input validation schemas when adding new query parameters

## Security Incident Response

If a security vulnerability is discovered:
1. Document the issue privately
2. Assess impact and severity
3. Develop and test a fix
4. Deploy the fix as quickly as possible
5. Notify affected users if necessary

## Dependencies

Security-related dependencies:
- `helmet@^8.0.0`: Security headers
- `express-rate-limit@^7.0.0`: Rate limiting
- `zod@^3.0.0`: Input validation
- `cors@^2.8.5`: CORS middleware

Keep these dependencies up to date to receive security patches.
