# Troubleshooting Guide

This page lists common configuration issues, connection errors, and integration failures with instructions on how to diagnose and resolve them.

---

## 1. Discord Bot Issues

### Bot is Offline
- **Check the Logs**: Inspect backend logs for initialization failures like `Disallowed Intents` or `Invalid Token`.
- **Privileged Gateway Intents**: The bot requires three intents enabled in the [Discord Developer Portal](https://discord.com/developers/applications) under the **Bot** tab:
  1. Presence Intent
  2. Server Members Intent
  3. Message Content Intent (Critical: if disabled, the bot cannot read command parameters).
- **Check the Status Toggle**: Make sure the bot is toggled **ON** in the Admin Settings panel (or `DISCORD_BOT_TOKEN` is loaded in `.env`).

### Slash Commands Do Not Appear in Discord
- **Guild Scoping**: By default, commands are registered to a specific server (`DISCORD_GUILD_ID`). Verify the Guild ID matches your server ID.
- **Manual Registration**: Run the command registration script:
  ```bash
  pnpm --filter backend run register-commands
  ```
- **Caching**: Discord caches commands locally. Fully restart your Discord client (or wait 10 minutes) if commands do not appear immediately.

---

## 2. Zoom Integration Issues

### OAuth "Redirect URI Mismatch" Error
- **The Cause**: The URI sent by the application does not match the allowed redirect list in the Zoom App Marketplace.
- **The Solution**: Compare the redirect URI in the Zoom dashboard with the value in the backend's environment variables (`ZOOM_REDIRECT_URI`). Ensure it includes the `/csfaq/` prefix:
  `https://yourdomain.com/csfaq/api/zoom/auth/callback`

### Meeting Recordings Are Not Ingested
- **No VTT Transcripts**: The system requires WebVTT transcript files. If cloud recordings are generated without audio transcripts, the parser will skip the meeting. Enable **Audio Transcript** in your Zoom Cloud Recording Settings.
- **Webhook Key Mismatch**: Verify the `ZOOM_WEBHOOK_SECRET_TOKEN` is configured and matches the secret token in the Zoom app dashboard. If they do not match, the backend will discard the webhooks as unauthorized.
- **Circuit Breaker Open**: If Zoom APIs suffer consecutive timeouts, the backend trips the circuit breaker to prevent server-side thread blockages. Check logs for `Zoom Circuit Breaker Open` messages. The circuit resets automatically after 1 minute of API silence.

---

## 3. Search and Vector Database Issues

### Search Returns 0 Results
- **Index Missing**: MongoDB Atlas Vector Search requires a vector index named exactly `vector_index` on the `embedding` field. Verify the index is active in your MongoDB Atlas dashboard.
- **Min Score Threshold**: The default minimum score threshold is `0.3`. If query embeddings do not match documents above this similarity score, they are filtered out. You can adjust `search.hybrid.minScore` in your YAML config.
- **Text Index Missing**: Traditional keyword search requires text indexes on the `faqs` and `communityposts` collections. If the text index is missing, search queries will log warnings and fall back to vector-only results.

---

## 4. Redis and Caching Issues

### Warnings: "Redis connection failed"
- **Graceful Fallback**: The server is designed to degrade gracefully. If Redis is unreachable, the system automatically falls back to process-local LRU caches. The server will not crash, but API search speeds may degrade slightly under high load.
- **Troubleshooting**: Check the connection string `REDIS_TCP_URL` in your backend `.env` file. Ensure firewall rules allow the backend server to communicate with the Redis host.

---

## 5. Web/Browser CORS Errors

### Requests Blocked by CORS Policy
- **The Cause**: The browser blocks API requests because the backend has not white-listed the frontend's origin host.
- **The Solution**: Open your backend configuration (`config.prod.yaml` or `config.default.yaml`) and ensure your public frontend domain is listed under `cors.allowedOrigins`:
  ```yaml
  cors:
    allowedOrigins:
      - "https://yourdomain.com"
  ```
