# Discord Bot — Setup Guide

The Yaksha FAQ portal has a built-in Discord bot. It's optional —
if you don't set `DISCORD_BOT_TOKEN`, the bot never starts and the
rest of the app keeps running.

## What the bot does

### Public slash commands (anyone can use)

| Command | What it does |
|---|---|
| `/ask <question>` | Calls `/api/ask-ai`, posts the AI answer as an embed with sources. |
| `/search <query>` | Calls `/api/search`, returns top N results with scores. |
| `/status` | Server health snapshot (DB connection, version, etc.). |
| `/help` | Lists all commands, marks admin-only ones. |

### Admin-only slash commands (gated on `DISCORD_ADMIN_USER_IDS`)

| Command | What it does |
|---|---|
| `/tickets [status]` | List support tickets (default: `open`). Calls admin endpoint. |
| `/resolve <id> <note>` | Mark a support ticket resolved. |
| `/ban <user_id_or_email> <reason>` | Ban a user. Posts an audit entry. |
| `/broadcast <message>` | Post a message to the configured notification channel. |

### Auto-notifications (posted to `DISCORD_NOTIFICATION_CHANNEL_ID`)

- 🆕 New support ticket (with `@here` if it's a Golden Ticket)
- ✅ Support ticket resolved
- 🏆 Golden ticket converted
- 🚫 User banned
- 🏅 Reputation milestone (planned)

## One-time Discord app setup

These are 7 manual steps in the Discord UI. Takes ~5 minutes.

### 1. Create the application

1. Open https://discord.com/developers/applications
2. Click **"New Application"** in the top right
3. Name: `Yaksha Bot` (or whatever you like)
4. Click **Create**

### 2. Create the bot user

1. In the left sidebar, click **"Bot"**
2. Click **"Add Bot"** → confirm
3. Under "Token", click **"Reset Token"** → **"Yes, do it!"**
4. **Copy the token** — this is `DISCORD_BOT_TOKEN`. Don't share it.
5. Under "Privileged Gateway Intents", enable:
   - **Message Content Intent** (only if you plan to add prefix commands — slash commands don't need it)
   - The other two (Server Members, Presence) can stay off

### 3. Get the application ID and public key

1. In the left sidebar, click **"General Information"**
2. Copy **"Application ID"** — this is `DISCORD_CLIENT_ID`
3. (No need for public key — slash commands use the bot token)

### 4. Get the guild (server) ID

1. Open Discord, go to your server
2. Right-click the server icon → **"Copy Server ID"** — this is `DISCORD_GUILD_ID`
   - If you don't see "Copy Server ID", enable Developer Mode: User Settings → Advanced → Developer Mode ON

### 5. Invite the bot to your server

In the Discord Developer Portal (your app):

1. Left sidebar → **"OAuth2"** → **"URL Generator"**
2. Scopes: check **`bot`** and **`applications.commands`**
3. Bot permissions: check at minimum:
   - `Send Messages`
   - `Embed Links`
   - `Read Message History`
   - (Optional) `Manage Messages` if you want the bot to edit/delete its own status messages
4. Copy the generated URL, paste in your browser, pick your server
5. Confirm

### 6. Set the env vars in `backend/.env.local`

```bash
DISCORD_BOT_TOKEN=***    # from step 2
DISCORD_CLIENT_ID=***    # from step 3
DISCORD_GUILD_ID=***     # from step 4
DISCORD_ADMIN_USER_IDS=111,222,333   # comma-separated, your admin Discord user IDs
DISCORD_NOTIFICATION_CHANNEL_ID=444   # channel ID where new-ticket etc. gets posted
DISCORD_PUBLIC_CHANNEL_ID=555        # optional, reserved for future use
INTERNAL_API_KEY=***                 # shared secret for /tickets, /resolve, /ban
                                    # (use the same one your internal admin endpoints expect)
PUBLIC_URL=http://localhost:6767     # backend URL the bot calls
```

**Discord user ID = right-click your username in Discord → "Copy User ID"** (needs Developer Mode on).

**Channel ID = right-click the channel name in Discord → "Copy Channel ID"**.

### 7. Register the slash commands

The bot auto-registers on first connect (guild-scoped = instant). For production (global = 1 hr to propagate), run:

```bash
cd /Users/yashhwanth/Documents/crowd-source-faq/backend

# Dev: instant register against your test server
npm run bot:register:guild

# Production: register globally (Discord propagates within ~1 hour)
npm run bot:register:global
```

The bot also re-registers guild commands on every startup, so you usually don't need to run this manually for dev.

## Restart the backend

```bash
cd /Users/yashhwanth/Documents/crowd-source-faq
./run.sh
```

On startup, you should see in the logs:

```
[bot] Discord client ready — logged in as Yaksha Bot#1234 (id …)
[bot] serving guild <your guild id>
[bot] guild slash commands registered (instant)
```

## Test the commands

In your Discord server, type `/` and you should see:
- `/ask`
- `/search`
- `/status`
- `/help`
- `/tickets` (admin only — hidden if you're not on the admin list)
- `/resolve` (admin only)
- `/ban` (admin only)
- `/broadcast` (admin only)

Try `/ask how do I apply` first.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Backend logs `[bot] DISCORD_BOT_TOKEN / DISCORD_CLIENT_ID / DISCORD_GUILD_ID not set` | Env vars not loaded. Check `backend/.env.local` exists and has the keys. |
| `Invalid token` on startup | Wrong `DISCORD_BOT_TOKEN`. Reset the token in Developer Portal → Bot. |
| `Missing Permissions` when the bot tries to send a notification | Bot is in the server but doesn't have `Send Messages` / `Embed Links` in its channel permissions. Server Settings → Roles → Yaksha Bot → channel overrides. |
| `Missing Access` on a slash command reply | Bot isn't in the channel/thread, or doesn't have permission for the channel. |
| Commands registered but not appearing in Discord | Wait ~1 hour (global register) or re-invite the bot with `applications.commands` scope. |
| `/tickets` says `INTERNAL_API_KEY not set` | The bot's admin endpoints need a shared secret to talk to the backend. Set `INTERNAL_API_KEY` and have your `INTERNAL_API_KEY` middleware accept it. |
| Discord rate limit error | Back off. Discord.js auto-retries, but you might see `429` if you spam. |

## Architecture

The bot is a separate module (`backend/bot/`) that runs **in the same Node process** as the backend. It uses the same `MONGODB_URI` indirectly (via the backend's REST API). No separate deploy, no separate process manager.

```
Discord user
   ↓ /ask
Bot (discord.js)
   ↓ fetch PUBLIC_URL/api/ask-ai
Backend (Express)
   ↓ mongoose
MongoDB
```

The bot is gated on env vars — if you remove `DISCORD_BOT_TOKEN`, it just doesn't start. The rest of the app keeps running.
