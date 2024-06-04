// Importing necessary classes and files.
require('dotenv/config');
const { Client, Events, Collection, GatewayIntentBits } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const { OpenAI } = require('openai');

const db = require('./utils/database.js');
const bot = require('./utils/bot.js');
const conversation = require('../src/utils/conversation.js');

const config = require('../botConfig.json');
const models = config.GenerationModels;
const chatModels = models.ChatModels;
const imageModels = models.ImageModels;

try {
    // Fetch instance declarations and configurations.
    const client = bot.client;
    const openai = bot.openai;

    // Variables for the bot to operate.
    const ignorePrefix = process.env.IGNORE_PREFIX;

    // Initialise command files.
    client.commands = new Collection();
    const commandsPath = path.join(__dirname, 'commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
        } else {
            console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
        }
    }

    // Initialise event handlers.
    const eventsPath = path.join(__dirname, 'events');
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

    for (const file of eventFiles) {
        const filePath = path.join(eventsPath, file);
        const event = require(filePath);
        if (event.once) {
            client.once(event.name, (...args) => event.execute(...args));
        } else {
            client.on(event.name, (...args) => event.execute(...args));
        }
    }

    client.on('messageCreate', async (message) => {
        
        const channelID = message.channelId.toString();

        // Checks if the current channel has any records of being enabled in the db. (will need to be activated by /commands)
        const channelData = db.readDataBy('id', channelID);
        if (!channelData) return;

        // Retrieves the bot status in the channel where message is sent.
        const isChannelEnabled = channelData.isEnabled ? true : false;
        // console.log(isChannelEnabled + " | " + message.mentions.users.has(client.user.id));
        
        // Listens and responds to Discord messages if channel is enabled, and prevent replies with/without @mention.
        if (!isChannelEnabled && !message.mentions.users.has(client.user.id)) return;
        if (message.mentions.users.has(client.user.id)) return;

        // Message check conditions for the bot to ignore.
        if (message.author.bot) return;
        if (message.content.startsWith(ignorePrefix)) return;

        // Check for selected/current persona.
        const personaName = db.readDataBy('id', channelID).currentPersona;
        const selectedPersona = db.readPersona(channelID, personaName);

        // Check for the channel's current model.
        const currentChatModel = db.readDataBy('id', channelID).currentChatModel;

        // Fetch previous previous messages in current channel (limited to previous 10 messages).
        let prevMessages = await message.channel.messages.fetch({ limit: 10 });
        prevMessages.reverse(); // array is reversed since latest message is pushed towards the end
        prevMessages.forEach((message) => {

            // Check if the message is sent by the bot and if it contains '!'.
            if (message.author.bot && message.author.id !== client.user.id) return;
            if (message.content.startsWith(ignorePrefix)) return;

            // Need to evaluate the user's username (OpenAI does not allow special characters).
            const username = message.author.username.replace(/\s+/g, '_').replace(/[^\w\s]/gi, '');

            // If message is by bot, treat as an assistant.
            if (message.author.id === client.user.id) {
                conversation.push({
                    role: 'assistant',
                    name: username,
                    content: message.content,
                });

                return;
            }
            
            // If message belongs to a regular user.
            conversation.push({
                role: 'user',
                name: username,
                content: message.content,
            });
        });

        // Append the latest change in Mash's persona.
        conversation.push({
            role: 'system',
            content: `Your PERSONA is now known as '${personaName}' and you will act and respond according to the following description: ${selectedPersona}`
        });
        // console.log(conversation);gpt-4-turbo

        // Mock typing indicator while retrieving request from API.
        const awaitTypingState = await message.channel.sendTyping();
        const typingInterval = setInterval(function() { awaitTypingState; }, 5000);

        // Send request to the API to receive OpenAI's response.
        const response = await openai.chat.completions.create({
            model: currentChatModel,
            messages: conversation,
        }).catch((error) => console.error('OpenAI ERROR:\n', error));

        // Clearing the typing interval.
        if (response) { setTimeout(function() { clearInterval(typingInterval); }, 10000); }

        // Error handling for no response.
        if (!response) {
            message.reply("I'm having some trouble with the OpenAI API. Try again in a moment.");
            return; // <- to ensure bot does not reply an empty message.
        };

        // Break down messages over 2000 characters.
        const responseMessage = response.choices[0].message.content;
        const chunkSizeLimit = 2000;

        for (let i = 0; i < responseMessage.length; i += chunkSizeLimit) {
            const chunk = responseMessage.substring(i, i + chunkSizeLimit);

            // Reply to messages.
            await message.reply(chunk);
        };

        // Logs user replies in the chatroom.
        console.log("User " + message.author.id + " - " + message.author.username + "(" + message.author.displayName + ")" +" sent: " + message.content);
    });
    
    // Logs into Discord with the client's token.
    client.login(process.env.CLIENT_TOKEN);

} catch (error) {
    console.error(error);
};