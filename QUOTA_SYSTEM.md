# Quota System Documentation

## Overview

The Discord AI Bot implements a fair-use quota system to manage API costs and prevent abuse. Each user gets a separate quota allocation that resets relative to their first usage.

## Quota Types

### 1. AI Daily Quota (AI Responses)

- **Limit**: 5 responses per day
- **Usage**: Decremented when user mentions the bot or uses @mention
- **Reset**: 24 hours from last reset (user-relative)
- **Tracked by**: `quota_type = 'ai_daily'`

### 2. Image Weekly Quota (Image Generation)

- **Limit**: 3 generations per week
- **Usage**: Decremented when user runs `/image` command
- **Reset**: 7 days from last reset (user-relative)
- **Tracked by**: `quota_type = 'image_weekly'`

## User-Relative Reset System

Instead of a global reset time (e.g., midnight UTC), quotas reset relative to each user's first usage:

### Example Timeline

**User A** mentions the bot on Monday at 3 PM UTC
- AI Daily quota resets at Tuesday 3 PM UTC (24 hours later)
- Image Weekly quota resets at Monday 3 PM UTC next week (7 days later)

**User B** mentions the bot on Tuesday at 8 AM UTC
- AI Daily quota resets at Wednesday 8 AM UTC (24 hours later)
- Image Weekly quota resets at Tuesday 8 AM UTC next week (7 days later)

### Benefits of User-Relative Resets

- ✅ More fair distribution of API usage over time
- ✅ Prevents thundering herd during global reset times
- ✅ Reduces server load spikes
- ✅ Prevents quota accumulation strategies

## Database Schema

### Quota Storage

The `quotas` table tracks user quotas:

```sql
CREATE TABLE quotas (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL REFERENCES users(user_id),
  quota_type VARCHAR(50) NOT NULL,  -- 'ai_daily' or 'image_weekly'
  used_count INT DEFAULT 0,          -- How many used in current period
  last_reset TIMESTAMP,              -- When quota was last reset
  UNIQUE(user_id, quota_type)        -- One quota per user per type
);
```

### How Reset Works

The `shouldResetQuota()` function checks:

1. Get the `last_reset` timestamp from the database
2. Calculate days elapsed: `(now - last_reset) / (24 * 60 * 60 * 1000)`
3. For `ai_daily`: Reset if `daysDiff >= 1`
4. For `image_weekly`: Reset if `daysDiff >= 7`

When a reset occurs:
- `used_count` is set to 0
- `last_reset` is updated to current timestamp

## Quota Checking Flow

When a user attempts an action:

1. **Get or Create User**: Ensure user exists in the database
2. **Initialize Quota**: Create quota record if first time
3. **Check Reset**: Determine if quota should reset
4. **Apply Reset**: Reset if time threshold passed
5. **Check Limit**: Compare `used_count` against limit
6. **Allow/Deny**: Permit action if under limit, deny if at limit
7. **Increment**: Increase `used_count` on success

```
User Action
    ↓
Get/Create User
    ↓
Initialize Quota (if new)
    ↓
Check if Should Reset
    ↓ Reset Time Passed?
    ├─→ Yes: Reset to 0, update last_reset
    └─→ No: Keep current used_count
    ↓
Get Current used_count
    ↓
Compare with Limit
    ↓ Under Limit?
    ├─→ Yes: Allow action, increment count
    └─→ No: Deny action, show quota exceeded message
```

## Commands and Quota Usage

### `/balance` Command

Displays current quota status without using any quota.

**Response** (ephemeral, only visible to user):
```
📊 Your Quota Balance

🤖 AI Responses (Daily)
4/5 remaining

🖼️ Image Generations (Weekly)
2/3 remaining
```

### `/image <prompt>` Command

Generates an image and uses 1 image quota.

```
User: /image a cat wearing a astronaut suit

Bot:
1. Check user and quotas
2. Reset image quota if 7+ days passed since last reset
3. Check if user has remaining quota
4. If yes: Generate image, increment used_count
5. If no: Reply "❌ You've reached your weekly image generation quota"
```

### @Mention Usage

Reply to a message mentioning the bot and use 1 AI quota.

```
User: @Bot what is 2+2?

Bot:
1. Check user and quotas
2. Reset AI quota if 24+ hours passed since last reset
3. Check if user has remaining quota
4. If yes: Generate response, increment used_count, reply
5. If no: Reply "❌ You've reached your daily AI response quota"
```

## Error Messages

### Quota Exceeded - AI

```
❌ You've reached your daily AI response quota (5 per day). Try again tomorrow.
```

Actually shows when reset time is reached:
- Reset time = `last_reset + 24 hours`

### Quota Exceeded - Images

```
❌ You've reached your weekly image generation quota (3 per week). Try again next week.
```

Actually shows when reset time is reached:
- Reset time = `last_reset + 7 days`

### DM Attempt

```
❌ I do not accept direct messages. Please use me in a server.
```

### API Error

```
❌ Error processing your request. Please try again later.
```

## Monitoring Quotas

### Check a User's Quota in Database

```sql
-- Get user's current AI quota
SELECT used_count, last_reset FROM quotas
WHERE user_id = '123456789' AND quota_type = 'ai_daily';

-- Get user's current image quota
SELECT used_count, last_reset FROM quotas
WHERE user_id = '123456789' AND quota_type = 'image_weekly';

-- Check all users' usage
SELECT u.user_id, q.quota_type, q.used_count, q.last_reset
FROM quotas q
JOIN users u ON q.user_id = u.user_id
ORDER BY q.last_reset DESC;
```

### Manual Reset (Admin)

```sql
-- Reset a user's AI quota
UPDATE quotas
SET used_count = 0, last_reset = NOW()
WHERE user_id = '123456789' AND quota_type = 'ai_daily';

-- Reset a user's image quota
UPDATE quotas
SET used_count = 0, last_reset = NOW()
WHERE user_id = '123456789' AND quota_type = 'image_weekly';
```

## Edge Cases

### User Creates Account, Makes No Requests

- `quotas` table record is created with `used_count = 0`
- `last_reset` is set to account creation time
- Quota is active and counting down from creation

### User Hits Quota Limit Mid-Period

- Action is denied
- `used_count` does not increment
- User receives error message with expected reset time

### Quota Reset Boundary

- If user's quota expires at 3:15:30 PM and they make request at 3:15:31 PM
- Reset is triggered (more than 24/7 days have passed)
- Request succeeds with newly reset quota
- `used_count` becomes 1

### Timezone Considerations

- All timestamps are stored in database timezone (usually UTC)
- Reset calculation uses absolute time difference, not calendar days
- This is timezone-agnostic and fair across all regions

## API Cost Management

The quota system helps manage costs:

- **Average daily cost per user**: Low (5 AI responses, ~0.5 images)
- **Peak usage**: Some users max out quotas daily
- **Total cost**: Scales linearly with user count

## Future Enhancements

Possible improvements:

1. **Tiered Quotas**: Different limits for premium users
2. **Quota Sharing**: Team/guild-level quotas instead of per-user
3. **Burst Allowance**: Allow exceeding quota for short periods
4. **Usage Analytics**: Dashboard to view API usage trends
5. **Quota Purchases**: Allow users to buy additional quotas
6. **Time-Based Promos**: Increase quotas during beta/promotional periods
