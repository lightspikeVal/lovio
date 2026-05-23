require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, ActivityType } = require('discord.js');
const { Pool } = require('pg');
const OpenAI = require('openai');
const http = require('http');

// ======================
// DATABASE SETUP
// ======================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function initDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        user_id VARCHAR(255) PRIMARY KEY,
        first_interaction_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS quotas (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        quota_type VARCHAR(50) NOT NULL,
        used_count INT DEFAULT 0,
        last_reset TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, quota_type)
      );
    `);

    console.log('[v0] Database initialized');
  } catch (err) {
    console.error('[v0] Database initialization error:', err);
    process.exit(1);
  }
}

// ======================
// API CLIENT SETUP
// ======================
const openai = new OpenAI({
  apiKey: process.env.API_KEY,
  baseURL: 'https://api2.novisurf.top/v1',
});

// ======================
// UTILITY FUNCTIONS
// ======================

async function getOrCreateUser(userId) {
  try {
    const result = await pool.query(
      'SELECT user_id FROM users WHERE user_id = $1',
      [userId]
    );
    if (result.rows.length === 0) {
      await pool.query(
        'INSERT INTO users (user_id) VALUES ($1)',
        [userId]
      );
    }
  } catch (err) {
    console.error('[v0] Error getting/creating user:', err);
  }
}

async function shouldResetQuota(userId, quotaType) {
  try {
    const result = await pool.query(
      'SELECT last_reset FROM quotas WHERE user_id = $1 AND quota_type = $2',
      [userId, quotaType]
    );

    if (result.rows.length === 0) {
      return true;
    }

    const lastReset = new Date(result.rows[0].last_reset);
    const now = new Date();

    if (quotaType === 'ai_daily') {
      const daysDiff = Math.floor((now - lastReset) / (1000 * 60 * 60 * 24));
      return daysDiff >= 1;
    } else if (quotaType === 'image_weekly') {
      const daysDiff = Math.floor((now - lastReset) / (1000 * 60 * 60 * 24));
      return daysDiff >= 7;
    }
    return false;
  } catch (err) {
    console.error('[v0] Error checking reset:', err);
    return false;
  }
}

async function initializeQuota(userId, quotaType) {
  try {
    await pool.query(
      `INSERT INTO quotas (user_id, quota_type, used_count, last_reset)
       VALUES ($1, $2, 0, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id, quota_type) DO NOTHING`,
      [userId, quotaType]
    );
  } catch (err) {
    console.error('[v0] Error initializing quota:', err);
  }
}

async function resetQuotaIfNeeded(userId, quotaType) {
  try {
    if (await shouldResetQuota(userId, quotaType)) {
      await pool.query(
        `UPDATE quotas
         SET used_count = 0, last_reset = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND quota_type = $2`,
        [userId, quotaType]
      );
    }
  } catch (err) {
    console.error('[v0] Error resetting quota:', err);
  }
}

async function getQuotaStatus(userId, quotaType) {
  try {
    await getOrCreateUser(userId);
    await initializeQuota(userId, quotaType);
    await resetQuotaIfNeeded(userId, quotaType);

    const result = await pool.query(
      'SELECT used_count FROM quotas WHERE user_id = $1 AND quota_type = $2',
      [userId, quotaType]
    );

    if (result.rows.length === 0) {
      return { used: 0 };
    }

    const used = result.rows[0].used_count;
    const limit = quotaType === 'ai_daily' ? 5 : 3;
    const remaining = Math.max(0, limit - used);

    return { used, remaining, limit };
  } catch (err) {
    console.error('[v0] Error getting quota status:', err);
    return { used: 0, remaining: 0, limit: 0, error: true };
  }
}

async function incrementQuota(userId, quotaType) {
  try {
    await pool.query(
      `UPDATE quotas
       SET used_count = used_count + 1
       WHERE user_id = $1 AND quota_type = $2`,
      [userId, quotaType]
    );
  } catch (err) {
    console.error('[v0] Error incrementing quota:', err);
  }
}

// ======================
// AI RESPONSE FUNCTION
// ======================

async function getAIResponse(userMessage) {
  try {
    const response = await openai.chat.completions.create({
      model: 'mistral/mistral-small',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: userMessage,
        },
      ],
    });

    return response.choices[0].message.content;
  } catch (err) {
    console.error('[v0] Error getting AI response:', err);
    throw err;
  }
}

// ======================
// IMAGE GENERATION FUNCTION
// ======================

async function generateImage(prompt) {
  try {
    const response = await openai.images.generate({
      model: 'xai/grok-imagine-image',
      prompt: prompt,
      n: 1,
      size: '1024x1024',
    });

    return response.data[0].url;
  } catch (err) {
    console.error('[v0] Error generating image:', err);
    throw err;
  }
}

// ======================
// DISCORD BOT SETUP
// ======================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Command definitions
const commands = [
  new SlashCommandBuilder()
    .setName('image')
    .setDescription('Generate an image using AI')
    .addStringOption((option) =>
      option
        .setName('prompt')
        .setDescription('The prompt for image generation')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Check your AI and image generation quota'),
];

// ======================
// READY EVENT
// ======================

client.once('ready', async () => {
  console.log(`[v0] Bot logged in as ${client.user.tag}`);

  // Set bot status
  await client.user.setPresence({
    activities: [
      {
        name: '@lovio for AI responses',
        type: ActivityType.Listening,
      },
    ],
    status: 'online',
  });
  console.log('[v0] Bot status set to: Listening to @lovio for AI responses');

  // Register slash commands
  try {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    const commandData = commands.map((cmd) => cmd.toJSON());

    await rest.put(Routes.applicationCommands(client.application.id), {
      body: commandData,
    });

    console.log('[v0] Slash commands registered');
  } catch (err) {
    console.error('[v0] Error registering commands:', err);
  }
});

// ======================
// INTERACTION HANDLER (Slash Commands)
// ======================

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isCommand()) return;

  const userId = interaction.user.id;

  if (interaction.commandName === 'balance') {
    try {
      const aiStatus = await getQuotaStatus(userId, 'ai_daily');
      const imageStatus = await getQuotaStatus(userId, 'image_weekly');

      if (aiStatus.error || imageStatus.error) {
        await interaction.reply({
          content: '❌ Error retrieving quota information.',
          flags: 64,
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('📊 Your Quota Balance')
        .addFields(
          {
            name: '🤖 AI Responses (Daily)',
            value: `${aiStatus.remaining}/${aiStatus.limit} remaining`,
            inline: true,
          },
          {
            name: '🖼️ Image Generations (Weekly)',
            value: `${imageStatus.remaining}/${imageStatus.limit} remaining`,
            inline: true,
          }
        )
        .setTimestamp();

      await interaction.reply({
        embeds: [embed],
        flags: 64,
      });
    } catch (err) {
      console.error('[v0] Error in /balance command:', err);
      await interaction.reply({
        content: '❌ Error retrieving quota information.',
        flags: 64,
      });
    }
  } else if (interaction.commandName === 'image') {
    try {
      const prompt = interaction.options.getString('prompt');

      // Check quota
      const imageStatus = await getQuotaStatus(userId, 'image_weekly');
      if (imageStatus.remaining <= 0) {
        await interaction.reply({
          content: `❌ You've reached your weekly image generation quota (3 per week). Try again next week.`,
          ephemeral: true,
        });
        return;
      }

      // Defer reply
      await interaction.deferReply();

      // Generate image
      const imageUrl = await generateImage(prompt);
      await incrementQuota(userId, 'image_weekly');

      const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('🖼️ Generated Image')
        .setImage(imageUrl)
        .setDescription(`Prompt: ${prompt}`)
        .setTimestamp();

      await interaction.editReply({
        embeds: [embed],
      });
    } catch (err) {
      console.error('[v0] Error in /image command:', err);
      await interaction.editReply(
        '❌ Error generating image. Please try again later.'
      );
    }
  }
});

// ======================
// MESSAGE HANDLER (@mention responses)
// ======================

client.on('messageCreate', async (message) => {
  // Ignore bot messages
  if (message.author.bot) return;

  // Check if message is from DM (channel type is DM)
  if (message.channel.type === 'DM') {
    try {
      await message.reply('❌ I do not accept direct messages. Please use me in a server.');
    } catch (err) {
      console.error('[v0] Error replying to DM:', err);
    }
    return;
  }

  // Check if bot is mentioned anywhere in the message
  const botMentioned = message.mentions.has(client.user.id);

  if (!botMentioned) return;

  try {
    // Check quota
    const aiStatus = await getQuotaStatus(message.author.id, 'ai_daily');
    if (aiStatus.remaining <= 0) {
      await message.reply(
        `❌ You've reached your daily AI response quota (5 per day). Try again tomorrow.`
      );
      return;
    }

    // Extract message content without bot mention
    let userMessage = message.content
      .replace(`<@${client.user.id}>`, '')
      .replace(`<@!${client.user.id}>`, '')
      .trim();

    if (!userMessage) {
      await message.reply('Please provide a message for me to respond to.');
      return;
    }

    // Send initial "Surfing..." message
    const surfingMessage = await message.reply('Surfing...');

    // Get AI response
    const aiResponse = await getAIResponse(userMessage);
    await incrementQuota(message.author.id, 'ai_daily');

    // Split response into 4 chunks for streaming effect
    const chunkCount = 4;
    const chunkSize = Math.ceil(aiResponse.length / chunkCount);
    const chunks = [];
    for (let i = 0; i < chunkCount; i++) {
      chunks.push(aiResponse.slice(i * chunkSize, (i + 1) * chunkSize));
    }

    // Stream chunks with 0.8s delay between each
    for (let i = 0; i < chunks.length; i++) {
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 800)); // 0.8 second delay
      }
      await surfingMessage.edit(chunks.slice(0, i + 1).join(''));
    }
  } catch (err) {
    console.error('[v0] Error in message handler:', err);
    await message.reply('❌ Error processing your request. Please try again later.');
  }
});

// ======================
// ERROR HANDLING
// ======================

client.on('error', (error) => {
  console.error('[v0] Discord client error:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[v0] Unhandled Rejection at:', promise, 'reason:', reason);
});

// ======================
// HTTP SERVER (Health Check)
// ======================

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', bot: client.user ? client.user.tag : 'disconnected' }));
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  }
});

server.listen(PORT, () => {
  console.log(`[v0] Health check server listening on port ${PORT}`);
});

// ======================
// BOT START
// ======================

async function start() {
  try {
    await initDatabase();
    await client.login(process.env.DISCORD_TOKEN);
  } catch (err) {
    console.error('[v0] Failed to start bot:', err);
    process.exit(1);
  }
}

start();
