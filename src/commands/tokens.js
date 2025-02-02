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
        .setName('tokens')
        .setDescription('Check your token balance.'),
    async execute(interaction) {
        const user = interaction.user;
        const userID = user.id;
        const username = user.username;

        // Get user's token balance from the database.
        const userTokens = db.readDataBy('users', 'id', userID).tokensUsed;

        // Create an embed message to display the user's token balance.
        const embed = new EmbedBuilder()
            .setTitle(`${tokenEmoji} ${username}'s Token Usage`)
            .setDescription(`You have used: ${bold(userTokens)} tokens.`)
            .setColor(colors.botColor)
            .setTimestamp();

        // Reply with the embed message.
        await interaction.reply({ embeds: [embed] });
    },
};