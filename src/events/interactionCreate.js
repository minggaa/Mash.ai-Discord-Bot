const { Events } = require('discord.js');

// Receive command interactions.
module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        
        if (!interaction.isChatInputCommand()) return; // to handle only slash commands

        const command = interaction.client.commands.get(interaction.commandName);
    
        if (!command) { // handles when the command is not found.
            console.error(`No command matching ${interaction.commandName} was found.`);
            return;
        }
    
        try { // executes the command with provided arguments and sends response back to user.
            await command.execute(interaction);
        } catch (error) { // handles any errors that occur during execution.
            console.error(error);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: 'An error occured while executing this command!', ephemeral: true });
            } else {
                await interaction.reply({ content: 'An error occured while executing this command!', ephemeral: true });
            }
        }
    },
};