// Importing necessary classes and files.
require('dotenv/config');
const { 
    SlashCommandBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ActionRowBuilder,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    AttachmentBuilder,
    Collection,
    MessageManager,
    bold, italic, inlineCode} = require('discord.js');
const wait = require('node:timers/promises').setTimeout;

const db = require('../utils/database.js');
const bot = require('../utils/bot.js');
const colors = bot.colors;

const config = require('../../botConfig.json');
const emojis = config.commandEmojis;

// Define constants.
const tokenEmoji = emojis.tokenEmoji;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('usage')
        .setDescription('Check your OpenAI token and costs usage.'),
    async execute(interaction) {
        const user = interaction.user;
        const userID = user.id;
        const username = user.username;

        // Get user's token balance from the database.
        const userData = db.readDataBy('users', 'id', userID);

        // Set desctiption for the embed message.
        const description = `You have used: ${bold(userData.tokensUsed)} tokens.
                             Total usage cost: $${bold(userData.imageCosts || 0)}`;
        const disclaimer = `Disclaimer: Image generated does not count to tokens used but to costs directly.`;

        // Create an embed message to display the user's token balance.
        const embed = new EmbedBuilder()
            .setTitle(`${tokenEmoji} ${username}'s Token(s) and Cost(s) Usage`)
            .setDescription(description)
            .setColor(colors.botColor)
            .setFooter({ text: disclaimer })
            .setTimestamp();

        // Reply with the embed message.
        await interaction.reply({ embeds: [embed] });
    },
};