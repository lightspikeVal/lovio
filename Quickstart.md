# Discord AI Bot - Quick Start

Get your Discord AI bot up and running in 5 minutes!

## Prerequisites

- Node.js 16+
- PostgreSQL running locally or a connection string
- A Discord bot token (from [Discord Developer Portal](https://discord.com/developers/applications))
- API key for `api2.novisurf.top/v1`

## Step 1: Clone and Install

```bash
cd discord-bot
npm install
```

## Step 2: Create Environment File

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Edit `.env` and add your values:

```env
DISCORD_TOKEN=your_bot_token_here
API_KEY=your_api_key_here
DATABASE_URL=postgresql://localhost/discord_bot
```

## Step 3: Setup Database (Local Development)

Create a PostgreSQL database:

```bash
createdb discord_bot
```

Or using psql:
```bash
psql
# In psql:
> CREATE DATABASE discord_bot;
> \q
```

## Step 4: Run the Bot

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

You should see:
```
[v0] Database initialized
[v0] Bot logged in as YourBot#1234
[v0] Slash commands registered
```

## Step 5: Test the Bot

### Add Bot to Server

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Select your application
3. Go to OAuth2 > URL Generator
4. Select scopes: `bot`
5. Select permissions: `Send Messages`, `Read Messages/View Channels`, `Embed Links`
6. Copy and open the generated URL to invite bot to your server

### Test @Mention

In any Discord channel:
```
@YourBot Hello! How are you?
```

Bot responds with AI-generated reply.

### Test /image Command

```
/image a futuristic city at night
```

Bot generates an image based on your prompt.

### Check /balance

```
/balance
```

Shows your remaining quotas (only visible to you).

## Quota Limits

- **AI Responses**: 5 per day (reset after 24 hours from first usage)
- **Image Generations**: 3 per week (reset after 7 days from first usage)

Run `/balance` to check your current usage.

## Error Handling

The bot handles common errors gracefully:

- ❌ **Quota exceeded**: You'll get a clear message about when you can use the command again
- ❌ **DM attempt**: Bot won't respond in DMs, only in servers
- ❌ **API error**: Bot will let you know if something went wrong

## Common Issues

### Bot doesn't respond to @mentions

1. Check that bot has "Send Messages" permission in the channel
2. Verify you're mentioning the bot correctly: `@YourBot`
3. Check console for errors

### "database connection refused"

Ensure PostgreSQL is running:
```bash
# Check if running
psql -l

# If not, start it (macOS with Homebrew):
brew services start postgresql

# Or on Linux:
sudo systemctl start postgresql
```

### "DISCORD_TOKEN not set"

Make sure `.env` file exists and has your Discord token.

### "API_KEY not set"

Make sure `.env` file has your API key for `api2.novisurf.top/v1`.

## Next Steps

### Deploy to Production

See [DEPLOYMENT.md](./DEPLOYMENT.md) for guides on:
- Heroku
- Railway
- DigitalOcean
- AWS Lambda
- And more

### Understand the Quota System

See [QUOTA_SYSTEM.md](./QUOTA_SYSTEM.md) for detailed information on:
- How quotas work
- User-relative reset times
- Database schema
- Monitoring and debugging

### Full Documentation

See [README.md](./README.md) for complete documentation on:
- All commands and features
- Database schema details
- Architecture overview
- Troubleshooting guide

## Need Help?

- Check the [README.md](./README.md) troubleshooting section
- Review [QUOTA_SYSTEM.md](./QUOTA_SYSTEM.md) for quota questions
- Check logs: `npm run dev` shows real-time logs
- Database issues? Try: `psql $DATABASE_URL`

## What's Next?

1. ✅ Bot is running locally
2. 📊 Deploy to production (see DEPLOYMENT.md)
3. 🔧 Customize quotas in `aibot-discord.js` (lines 97-98)
4. 📈 Monitor usage in your database

Happy chatting! 🤖
