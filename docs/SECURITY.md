# Security Checklist & Posture

QanoAI handles sensitive customer conversations. The following mechanisms enforce security across the platform.

## 1. Tenant Isolation
Every database model that belongs to a tenant includes an `organizationId`.
- **Backend Enforcement**: The `OrganizationGuard` automatically intercepts API requests and verifies that the `organizationId` requested matches the ID bound to the user's JWT token.
- **Database Queries**: Developers **must** include `organizationId` in the `where` clause of every Prisma query. There are no exceptions.

## 2. Authentication
- JWT tokens are signed using `HS256`.
- The `AUTH_SECRET` must be rotated annually.
- Realtime connections (`apps/realtime`) strictly require the JWT token to be passed during the WebSocket handshake. Unauthenticated sockets are instantly terminated.

## 3. Data Encryption
- Sensitive third-party credentials (like OpenAI keys or custom webhook secrets) are encrypted at rest using AES-256-GCM via the `CREDENTIAL_ENCRYPTION_KEY`.

## 4. CSRF and XSS
- The NestJS API uses `helmet()` to enforce strict CSP and HSTS headers.
- Next.js naturally sanitizes React children to prevent XSS.

## Checklist for Production
- [ ] Ensure all default passwords (e.g. `qanoai_dev_password`) are changed in `.env`.
- [ ] Restrict Database (5432) and Redis (6379) ports via Firewall so they are only accessible locally by the Node.js apps.
- [ ] Configure HTTPS/SSL certificates on your Reverse Proxy (Nginx/IIS). Never expose the Node.js servers directly to the internet over HTTP.
