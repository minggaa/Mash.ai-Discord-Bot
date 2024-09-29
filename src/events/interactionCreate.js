const { Events, inlineCode } = require('discord.js');

const bot = require('../utils/bot.js');
const colors = bot.colors;
const errorLog = bot.errorLog;

// Receive command interactions.
module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {

        const errorEmbed = (title, description) => bot.errorEmbed(errorLog, title, description);
        const command = interaction.client.commands.get(interaction.commandName);

        // Handles when the command is not found.
        const checkCommand = (command) => {
            if (!command) { 
                console.error(`No command matching ${interaction.commandName} was found.`);
                return false;
            };
            return true;
        };

        if (interaction.isChatInputCommand()) {
            const commandName = command.data.name;
            if (!checkCommand(command)) return;
        
            try { // executes the command with provided arguments and sends response back to user.
                await command.execute(interaction);
            } catch (error) {
                console.error('INTERACTION CREATE ERROR:\n', error);
                errorLog.push(error);

                const properties = {
                    embeds: [errorEmbed('An error occured while executing this command!', `Use ${inlineCode(`/${commandName}`)} to try again.`)],
                    ephemeral: true,
                };
                
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(properties);
                } else {
                    await interaction.reply(properties);
                }
            }
        } else if (interaction.isAutocomplete()) {
            if (!checkCommand(command)) return;
    
            try {
                await command.autocomplete(interaction);
            } catch (error) {
                console.error(error);
            }
        };
    },
};