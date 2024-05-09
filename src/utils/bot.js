// Importing necessary classes and files.
require('dotenv/config');
const { 
    Client,
    Events,
    Collection,
    GatewayIntentBits,
    EmbedBuilder,
    bold, italic, strikethrough } = require('discord.js');
const { OpenAI } = require('openai');

const db = require('./database.js');
const config = require('../../botConfig.json');

// Create new Client instance.
const client = new Client({ intents: ['Guilds', 'GuildMembers', 'GuildMessages', 'MessageContent'] });

// Configure OpenAI key to send API requests.
const openai = new OpenAI({
    apiKey: process.env.OPENAI_KEY, 
});

// Bot's colors.
const colors = {
    botColor: 'Random',
    successColor: 0x5db77b,
    failureColor: 0xc13748,
    timeoutColor: 0x80687f
};

// Check if bot has ever been used in this channel by its existence in the db.
function checkEnabled(channelID) {
    const retrieveRow = db.readDataBy('id', channelID);
    const checkRow = retrieveRow ? true : false;

    if (!checkRow) {
        // Create embed to display message.
        const embedMessage = new EmbedBuilder({
            title: `Seems like Bot-GPT hasn't been enabled in this channel yet.`,
            description: `To enable Bot-GPT, use the command ${bold('/botgpt')}.`,
            timestamp: new Date().toISOString(),
        }).setColor(colors.failureColor);

        return embedMessage;
    } else {
        return;
    };
};

module.exports = {
    client,
    openai,
    colors,
    checkEnabled 
};