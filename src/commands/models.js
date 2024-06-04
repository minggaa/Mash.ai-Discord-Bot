// Importing necessary classes and files.
const { 
    SlashCommandBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ActionRowBuilder,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle,
    bold, italic, inlineCode } = require('discord.js');

const db = require('../utils/database.js');
const bot = require('../utils/bot.js');
const colors = bot.colors;

const config = require('../../botConfig.json');
const emojis = config.commandEmojis;
const models = config.GenerationModels;
const chatModels = models.ChatModels;
const imageModels = models.ImageModels;

// Define constants.
const chatEmoji = emojis.chatEmoji;
const imageEmoji = emojis.imageEmoji;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('models')
        .setDescription('Change the OpenAI model used for the bot.')
        .addStringOption(
            option => option.setName('type')
                .setDescription('Select a model type for Mash to use.')
                .setRequired(true)
                .addChoices(
                    { name: 'Chat', value: 'chat' },
                    { name: 'Image', value: 'image' },
                )),
    async execute(interaction) {
        let type = interaction.options.getString('type');
        const channelID = interaction.channelId.toString();
        let getCurrentModelType;
        let getCurrentModel;
        let getModelsType;

        let currentChatModel;
        let currentImageModel;
        let embedFieldsObj;
        let selectMenuObj;

        // Check if bot has ever been used in this channel by its existence in the db.
        if (bot.checkEnabled(channelID)) {
            return await interaction.reply({
                embeds: [bot.checkEnabled(channelID)],
                ephemeral: true
            });
        };

        // Check for the current selected model type, then update current model.
        function fetchModelType(checkAllTypes) {
            currentChatModel = db.readDataBy('id', channelID).currentChatModel;
            currentImageModel = db.readDataBy('id', channelID).currentImageModel;

            if (checkAllTypes) {
                currentChatModel;
                currentImageModel;
                return;
            };

            if (type === 'chat') {
                getCurrentModelType = 'currentChatModel';
                getCurrentModel = currentChatModel;
                getModelsType = chatModels;
            } else if (type === 'image') {
                getCurrentModelType = 'currentImageModel';
                getCurrentModel = currentImageModel;
                getModelsType = imageModels;
            };
        };

        fetchModelType();

        const getModelKey = (curModel, modelsType) => {
            modelsType = modelsType || getModelsType;
            return Object.keys(modelsType).find(key => modelsType[key] === curModel.toString());
        };

        // Buttons declaration.
        const switchToChatModels = bot.buttonBuilder('switchToChatModels', `Switch to ${chatEmoji} Chat Models`, ButtonStyle.Primary);
        const switchToImageModels = bot.buttonBuilder('switchToImageModels', `Switch to ${imageEmoji} Image Models`, ButtonStyle.Primary);

        const buttonDisplay = ()=> {
            if (type === 'chat') {
                return switchToImageModels;
            } else if (type === 'image') {
                return switchToChatModels;
            };
        };

        // Clean and set up the initial state for EMBED and SELECT MENU.
        function setInteraction(toClear) {
            if (toClear) {
                embedFieldsObj.splice(0, embedFieldsObj.length);
                selectMenuObj.splice(0, selectMenuObj.length); // for setting the properties of the select menu
            };
            embedFieldsObj = [{ name: '\n', value: '\n' }]; // first object is for spacing
            selectMenuObj = [];
        };

        // Fetch each model data from JSON and dynamically append into EMBED and SELECT MENU.
        function populateInteraction() {
            let count = 1;

            if (type === 'chat') data = chatModels;
            else if (type === 'image') data = imageModels;

            Object.keys(data).forEach(key => {
                const value = data[key];
                const embedRows = {
                    name: `\t`,
                    value: `${bold(`${count++}.`)} ${key}`
                };

                embedFieldsObj.push(embedRows);

                const objRows = {
                    label: key,
                    value: value
                };

                selectMenuObj[key] = objRows;
            });
        };

        setInteraction();
        populateInteraction();

        // To dynamically retrieve and insert the channel's models as options into the menu.
        const menuOptions = (data, curModel) => {
            return Object.keys(data).map((models) => {
                const modelKey = data[models];
                return new StringSelectMenuOptionBuilder({
                    label: modelKey.label,
                    description: modelKey.description,
                    value: modelKey.value,
                    default: getModelKey(curModel) == modelKey.label ? true : false
                })
            });
        };

        const titleType = (isTitle) => {
            const formatType = type.replace(/\b(\s\w|^\w)/g, (txt) => txt.toUpperCase());
            const emoji = type === 'chat' ? chatEmoji : imageEmoji;

            if (isTitle) return `${emoji} ${formatType}`;
            else return formatType;
        };

        // Create embed to display model list.
        const embedView = (embedFields, curModel) => {
            return new EmbedBuilder({
                title: `${titleType(true)} Models in Channel '#${interaction.channel.name}'`,
                description: `:small_blue_diamond: ${bold(`Current Model:`)} ${italic(getModelKey(curModel))}`,
                fields: embedFields,
                timestamp: new Date().toISOString(),
            }).setColor(colors.botColor).addFields({ name: '\n', value: '\t' });
        };

        // Create the select menu interaction with recent retrevial of current model.
        const selectModelMenu = (curModel) => {
            return new StringSelectMenuBuilder({
                customId: 'selectModelMenu',
                placeholder: 'Select a Model...',
                min_values: 0,
                max_values: 1,
            }).setOptions(menuOptions(selectMenuObj, curModel));
        };

        // To flexibly add menu/buttons/etc. to action row.
        const addActionRow = function() {
            const actionRow = new ActionRowBuilder().addComponents();
            for (i in arguments) {
                actionRow.components.push(arguments[i]);
            };
            return actionRow;
        };

        // Sends embed and components as reply when using the command.
        const reply = await interaction.reply({
            embeds: [embedView(embedFieldsObj, getCurrentModel)],
            components: [addActionRow(selectModelMenu(getCurrentModel)), addActionRow(buttonDisplay())],
            ephemeral: true
        });

        // Retrieves the user selection.
        const collector = reply.createMessageComponentCollector({
            filter: (i) => i.user.id === interaction.user.id && (i.isButton() || i.isStringSelectMenu()),
            idle: 60_000,
        });

        function updateReply(state, contentMessage, curModel) {
            fetchModelType();
            // Check if component consists of an interaction, if yes then update menu to latest selection.
            let checkCurModel = curModel || getCurrentModel;

            // To update the select menu with user's selection.
            const newSelectMenu = selectModelMenu(checkCurModel);

            if (state === 'collecting') {
                return reply.edit({
                    content: italic(contentMessage),
                    embeds: [embedView(embedFieldsObj, checkCurModel)],
                    components: [addActionRow(newSelectMenu), addActionRow(buttonDisplay())]
                });
            };
            
            if (state === 'end') {
                reply.delete();
                fetchModelType(true);
                const getChatModel = getModelKey(currentChatModel, chatModels);
                const getImageModel = getModelKey(currentImageModel, imageModels);
                
                const showLatestModels = `${chatEmoji} ${bold('Current Chat Model:')} ${italic(getChatModel)}\n${imageEmoji} ${bold('Current Image Model:')} ${italic(getImageModel)}`;
                return interaction.followUp({ // can also swap with .channel.send
                    embeds: [embedView(embedFieldsObj, checkCurModel).setTitle('\t').setDescription(showLatestModels).setFields({ name: `\n`, value: `${italic(contentMessage)}` }).setColor(colors.timeoutColor)],
                    components: []
                });
            };

            if (state === 'update') {
                setInteraction(true);
                fetchModelType();
                populateInteraction();
                
                return reply.edit({
                    content: italic(contentMessage),
                    embeds: [embedView(embedFieldsObj, checkCurModel)],
                    components: [addActionRow(newSelectMenu.setOptions(menuOptions(selectMenuObj, checkCurModel))), addActionRow(buttonDisplay())]
                });
            }
        };

        // Listen for interaction that matches the collector's filter conditions.
        collector.on('collect', async (interaction) => {

            if (interaction.isButton()) {
                interaction.deferUpdate();
                switch (type) {
                    case "chat":
                        switchModels('image');
                        break;
                    case "image":
                        switchModels('chat');
                        break;
                    default:
                        console.log(`Unhandled type: ${type}\n`);
                };
            } else if (interaction.isStringSelectMenu()) {
                // Defer update for select menu interactions
                await interaction.deferUpdate();
                // If user unselects, revert to default model
                if (!interaction.values.length) {
                    db.updateData(channelID, getCurrentModelType, chatModels['GPT-4 Turbo']);
                    fetchModelType();
                    await updateReply('collecting', `You have emptied your selection, model reverted to ${getModelKey(getCurrentModel)}.`, getCurrentModel);
                    return;
                };
                
                // Updates the currentModel with the user selected model
                db.updateData(channelID, getCurrentModelType, interaction.values.toString());
                fetchModelType();
                await updateReply('collecting', `You have successfully selected '${bold(getModelKey(interaction.values))}'`, interaction.values);
            } else {
                console.log(`ERROR: Unhandled interaction type (${interaction.type})`);
            };

            async function switchModels(targetType) {
                type = targetType;
                await updateReply('update', `Switched model type. Currently editing '${bold(titleType(false))}' models.`);
            };
        });

        collector.on('end', async (collected, reason) => {
            if (reason === 'idle') {
                console.log(`Collected ${collected.size} interactions.`);
                await updateReply('end', `Your 1 minute selection period is over, selection menu has been closed.\nUse ${inlineCode('/model')} to configure Mash's models again.`);
            }
        });
    },
};