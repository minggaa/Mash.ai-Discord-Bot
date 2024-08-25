// Importing necessary classes and files.
const { SlashCommandBuilder } = require('discord.js');
const db = require('../utils/database.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mash')
        .setDescription('Start/Pause a conversation with Mash.')
        .addStringOption(
            option => option.setName('state')
                .setDescription('Enable/Disable Mash.')
                .setRequired(true)
                .addChoices(
                    { name: 'Start', value: 'start' },
                    { name: 'Pause', value: 'pause' },
                )),
    async execute(interaction) {
        const input = interaction.options.getString('state');
        const channelID = interaction.channelId.toString();
        const retrieveRow = db.readDataBy('appStatus', 'id', channelID);
        const checkRow = retrieveRow ? true : false;

        // Check if bot has ever been used in this channel by its existence in the db.
        if (!checkRow) {
            db.insertNewData('appStatus', channelID, 1);
            return await interaction.reply("Hello, I'm enabled.");
        };
        
        // Check for its 'isEnabled' status.
        const checkEnabled = retrieveRow.isEnabled;

        if (input == 'start') {
            if ((typeof checkEnabled != undefined || null) && checkEnabled == 0) { // checks if isEnabled is not empty and is false/"0"
                db.updateData('appStatus', channelID, 'isEnabled', 1);
                await interaction.reply("Hello, I'm enabled.");
            } else {
                await interaction.reply("I've already been enabled.");
            };

        };
        
        if (input == 'pause') {
            if ((typeof checkEnabled != undefined || null) && checkEnabled == 0) { // checks if isEnabled is not empty and is false/"0"
                await interaction.reply("I have already been paused, unable to pause without enabling me first.");
            } else {
                db.updateData('appStatus', channelID, 'isEnabled', 0);
                await interaction.reply("I've been paused.");
            };
        };
    },
};