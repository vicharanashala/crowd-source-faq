# Production URL Checklist

The platform is designed to be highly portable, avoiding hardcoded domain names or URLs in the source code. However, because frontend single-page applications bake environment variables at build time and third-party integrations (Zoom, Discord) restrict callback URIs for security, you must update several variables and settings when changing the production URL.

---

## 1. Backend Environment Variables (`apps/backend/.env`)

Update the following variables to reflect the new host domain:

| Variable | Description | Example Value |
|----------|-------------|---------------|
| `CLIENT_URL` | The public user-facing website URL. Used for CORS checks. | `https://yourdomain.com` |
| `PUBLIC_URL` | The external public URL of your API server. Used in emails, redirects, and logs. | `https://yourdomain.com` |
| `ZOOM_REDIRECT_URI` | The absolute callback path configured in your Zoom App dashboard. | `https://yourdomain.com/csfaq/api/zoom/auth/callback` |

---

## 2. Frontend Environment Variables (`apps/frontend/.env`)

Vite environment variables are baked into static assets **during build time**. 

| Variable | Description | Example Value |
|----------|-------------|---------------|
| `VITE_API_URL` | Path to the backend API. In unified deployments, leave as relative. | `/csfaq/api` |
| `VITE_PUBLIC_URL` | The public homepage URL. Used by the admin console to generate public links. | `https://yourdomain.com` |

> [!WARNING]
> **Rebuild Required**: Since Vite bakes `.env` values into JS files at compilation, you must run `pnpm build` or trigger a new Docker container build after updating these variables. Merely restarting the container or server will not apply the changes.

---

## 3. Zoom Marketplace App Configuration

To prevent OAuth redirection errors (`Redirect URI mismatch`) and webhook ingestion failures, update your application settings in the [Zoom App Marketplace](https://marketplace.zoom.us/):

1. **OAuth Redirect URL**:
   - Change to: `https://yourdomain.com/csfaq/api/zoom/auth/callback`
2. **OAuth Whitelist**:
   - Add/update: `https://yourdomain.com`
3. **Event Subscription (Webhooks)**:
   - Change the Endpoint URL to: `https://yourdomain.com/csfaq/api/zoom/webhook`
4. **Per-Program Zoom Settings**:
   - If you have set cohort-specific Zoom integrations, log in to the **Admin Dashboard -> Programs -> settings** and update the Client ID, Secret, and Redirect URL overrides for each active program.

---

## 4. Nginx Reverse Proxy Config

If your domain host has changed:
1. Update the `server_name` directive in your Nginx configuration:
   ```nginx
   server_name newdomain.com;
   ```
2. Run `sudo nginx -t` and reload Nginx (`sudo systemctl reload nginx`).
3. Update your SSL certificates (e.g., using Certbot: `sudo certbot --nginx -d newdomain.com`).

---

## 5. Summary verification checklist
After changing the URL, run these manual tests:
- [ ] Load `https://yourdomain.com/csfaq/` in a browser and verify the home page loads.
- [ ] Log in as an administrator.
- [ ] Go to Zoom Integration settings and click "Authenticate Zoom" to confirm the OAuth flow redirects to the correct callback URL.
- [ ] Run a test search query to verify the API returns results without CORS errors.
