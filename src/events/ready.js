const { Events } = require('discord.js');

// When client runs successfully, this code will notify of its status (runs only once).
module.exports = {
	name: Events.ClientReady,
	once: true,
	execute(client) {
        console.log(`\nReady! Logged in as ${client.user.tag}`);
        console.log("Bot is online.\n");
	},
};