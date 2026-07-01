# Discord Integration

The platform provides a Discord integration that supports two primary modes:
1. **Global/Fallback Bot**: Configured globally via system environment variables.
2. **Per-Program Bots**: Configured dynamically per batch/program via the Admin Panel (encrypted in `ProgramConfig`).

The integration allows students to query FAQs and AI directly from Discord, and allows staff to view, manage, and resolve tickets.

---

## Capabilities and Commands

The bot registers a series of slash commands on target Guilds:

- `/ask [question]` — Submits a question to the AI RAG engine, returning a generated answer with source references from the FAQ database.
- `/search [query]` — Performs a hybrid search over the FAQ database and returns the top matching entries.
- `/tickets` — Displays open support tickets assigned to the program or category.
- `/resolve [ticket-id]` — Closes a specific support ticket directly from Discord.
- `/status` — Returns the current status of the bot, connected database, and integration health.
- `/broadcast [message]` — Staff command to send an announcement to the designated public channel.
- `/ban [user]` — Staff command to suspend a user's access to the Q&A platform.
- `/admin` — Admin command for diagnostic commands and indexing triggers.

---

## Configuration Modes

### 1. Global Fallback Bot
If you only need one Discord bot for the entire system, set these variables in the backend `apps/backend/.env`:

| Env Variable | Description |
|--------------|-------------|
| `DISCORD_BOT_TOKEN` | The bot token from the Discord Developer Portal. |
| `DISCORD_CLIENT_ID` | The Application ID of your Discord Bot. |
| `DISCORD_GUILD_ID` | The Guild (Server) ID where commands should register immediately. |
| `DISCORD_WEBHOOK_URL`| Discord webhook URL for logging system events and exceptions. |

### 2. Multi-Program Bots (Dynamic)
In multi-tenant setups, different cohorts or batches run in separate Discord servers. Admins can configure individual bots for each program under **Admin -> Programs -> Program Settings -> Discord Settings**:
- **Application ID** & **Bot Token**
- **Guild ID**
- **Public Channel ID** (where broadcast notifications are posted)
- **Notification Channel ID** (where staff alerts for escalated support tickets are sent)

When a program's Discord config is enabled and saved, the backend decrypts the token, registers slash commands to that specific guild, and spawns a dedicated bot client.

---

## Setup and Installation

### 1. Developer Portal Setup
1. Go to the [Discord Developer Portal](https://discord.com/developers/applications).
2. Create a new Application.
3. Under **Bot**, enable the following **Privileged Gateway Intents**:
   - `PRESENCE INTENT`
   - `SERVER MEMBERS INTENT`
   - `MESSAGE CONTENT INTENT` (Critical for processing message text)
4. Copy the **Token** and the **Application ID (Client ID)**.

### 2. Invite the Bot
Generate an OAuth2 URL under **OAuth2 -> URL Generator**:
1. Check the `bot` scope and the `applications.commands` scope.
2. Under **Bot Permissions**, select:
   - `Send Messages`
   - `Embed Links`
   - `Read Message History`
   - `Use Slash Commands`
   - `Manage Messages` (For resolving/cleaning up messages)
3. Copy the URL, open it in your browser, and authorize it for your Guild.

### 3. Register Slash Commands
Slash commands must be registered with Discord before they appear in the chat UI.
- **Dynamic Per-Program Bots**: The system registers commands automatically when the bot is spawned or updated.
- **Global Bot**: Run the following script command to manually trigger registration for the global guild:
  ```bash
  pnpm --filter backend run register-commands
  ```

---

## Troubleshooting

### Bot is Offline
1. Check backend console logs. Ensure there is no error starting the bot (e.g. `Invalid Token` or `Privileged Intent Disallowed`).
2. Verify that the server can reach `discord.com` over HTTPS.
3. Confirm that the toggle in the Admin Dashboard is turned **ON** for the specific Program's Discord configuration.

### Slash Commands Not Showing Up
1. Command registration with Discord is cached. If you just invited the bot, wait 5–10 minutes, or fully restart the Discord client.
2. Verify that the `DISCORD_GUILD_ID` matches your server ID exactly. Global application commands can take up to an hour to propagate, whereas Guild-specific commands apply immediately.
3. Verify that you checked the `applications.commands` scope when generating the invite URL.

### Bot Does Not Respond to Message Context
1. Ensure the **Message Content Intent** is enabled under the Bot tab in the Discord Developer Portal.
2. Confirm the bot has permission to view the channel and write messages.
