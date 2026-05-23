# Discord AI Bot

A Discord bot built with Node.js that responds to @mentions with AI-powered responses and generates images. The bot includes quota management with persistent PostgreSQL storage.

## Features

- **@Mention Responses**: Reply to messages mentioning the bot with AI-generated responses using Mistral Small
- **Image Generation**: Generate images using the `/image` command with Grok Imagine Image model
- **Quota Management**: 
  - 5 AI responses per day (resets daily)
  - 3 image generations per week (resets every 7 days)
  - User-relative quota resets
- **Balance Command**: Check remaining quotas with the `/balance` command (ephemeral, user-only)
- **Error Handling**: User-facing error messages for quota exceeded, DM attempts, and API failures

## Prerequisites

- Node.js 16+
- PostgreSQL database
- Discord bot token
- API key for `api2.novisurf.top/v1`

## Setup

### 1. Clone and Install Dependencies

```bash
cd discord-bot
npm install
```

### 2. Environment Variables

Create a `.env` file in the `discord-bot` directory (see `.env.example`):

```env
DISCORD_TOKEN=your_discord_bot_token
API_KEY=your_api_key
DATABASE_URL=postgresql://user:password@host:port/database
```

### 3. Discord Bot Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Navigate to the "Bot" section and create a bot
4. Copy the token and add it to `.env` as `DISCORD_TOKEN`
5. Enable the following intents under "Privileged Gateway Intents":
   - Message Content Intent
   - Server Members Intent (optional)
6. Go to OAuth2 > URL Generator and select:
   - Scopes: `bot`
   - Permissions: `Send Messages`, `Embed Links`, `Read Messages/View Channels`
7. Use the generated URL to invite the bot to your server

### 4. Start the Bot

```bash
npm start
```

For development with auto-reload:

```bash
npm run dev
```

## Commands

### `/balance`
Check your current quota usage and remaining credits.
- **Response**: Ephemeral (only visible to you)
- **Shows**:
  - AI Responses remaining (daily limit: 5)
  - Image Generations remaining (weekly limit: 3)

### `/image <prompt>`
Generate an image based on your prompt.
- **Parameter**: `prompt` (required) - Description of the image to generate
- **Quota**: 1 credit per generation, 3 per week per user
- **Response**: Embeds the generated image with your prompt

### @Mention
Reply to any message mentioning the bot.
- **Quota**: 1 credit per response, 5 per day per user
- **Response**: AI-generated text response split into Discord message chunks if needed
- **Error**: Will refuse if used in direct messages

## Database Schema

The bot automatically creates two tables on startup:

### `users`
- `user_id` (VARCHAR): Discord user ID (primary key)
- `first_interaction_date` (TIMESTAMP): When the user first interacted with the bot

### `quotas`
- `id` (SERIAL): Primary key
- `user_id` (VARCHAR): Reference to users table
- `quota_type` (VARCHAR): Either `ai_daily` or `image_weekly`
- `used_count` (INT): Number of credits used in current period
- `last_reset` (TIMESTAMP): When the quota was last reset

Quotas reset relative to each user:
- `ai_daily`: Resets 24 hours after the last reset
- `image_weekly`: Resets 7 days after the last reset

## Architecture

The entire bot is contained in a single `aibot-discord.js` file with the following sections:

1. **Database Setup**: PostgreSQL connection and table initialization
2. **API Client**: OpenAI SDK configured for `api2.novisurf.top/v1`
3. **Utility Functions**: Quota checking, resetting, and user management
4. **AI Functions**: Message generation and image generation
5. **Discord Bot**: Client setup, slash commands, and message handlers
6. **Error Handling**: Comprehensive error logging and user feedback

## Troubleshooting

### Bot doesn't respond to mentions
- Ensure the bot has permissions to send messages in the channel
- Check that Message Content Intent is enabled in the Developer Portal
- Verify the bot is mentioned correctly in the message

### Image generation fails
- Check that `API_KEY` is correct in `.env`
- Ensure you have remaining weekly quota (check with `/balance`)
- API service may be temporarily unavailable

### Database connection errors
- Verify `DATABASE_URL` is correct and the database is running
- Ensure PostgreSQL can be reached from your machine
- Check that the user has proper permissions on the database

## License

ISC
