// Importing necessary classes and files.
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
    bold, italic, strikethrough, inlineCode } = require('discord.js');

const db = require('../utils/database.js');
const conversation = require('../utils/conversation.js');
const bot = require('../utils/bot.js');
const colors = bot.colors;

const config = require('../../botConfig.json');
const emojis = config.commandEmojis;
const pModal = config.PersonaModalsText;

// Define constants.
const defaultPersona = 'Default';
const personaEmoji = emojis.personaEmoji;
const currentEmoji = emojis.currentEmoji;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('persona')
        .setDescription('Access, select, and create various personas unique to your channels.'),
    async execute(interaction) {
        const channelID = interaction.channelId.toString();
        let channelPersonas;
        let getCurrentPersona;
        let embedFieldsObj;
        let selectPersonaObj;

        // Check if bot has ever been used in this channel by its existence in the db.
        if (bot.checkEnabled(channelID)) {
            return await interaction.reply({
                embeds: [bot.checkEnabled(channelID)],
                ephemeral: true
            });
        };

        // To fetch the latest persona data and current persona.
        function fetchPersonaData() {
            channelPersonas = db.readJSONData('personas', channelID);
            getCurrentPersona = db.readDataBy('id', channelID).currentPersona;
        };

        fetchPersonaData();

        // To ensure that the channel's current persona is not a value that doesn't exist in the DB.
        const checkCurrentPersona = db.checkCurrentPersona('personas', channelID, getCurrentPersona);
        checkCurrentPersona;

        // Update the OpenAI API bot with the latest change in persona.
        const pushConversation = function (curPersona) {
            console.log(`Persona to be pushed to Mash - \n${curPersona}: ${channelPersonas[curPersona]}\n`);
            return conversation.push({
                role: 'system',
                content: `Your PERSONA is now known as '${curPersona}' and you will act and respond according to the following description: ${channelPersonas[curPersona]}`
            });
        };

        // Buttons declaration.
        const newPersona = bot.buttonBuilder('newPersona', `New Persona`, ButtonStyle.Success);
        const editPersona = bot.buttonBuilder('editPersona', `Edit Persona`, ButtonStyle.Secondary);
        const deletePersona = bot.buttonBuilder('deletePersona', `Delete Persona`, ButtonStyle.Danger);

        // Clean and set up the initial state for EMBED and SELECT MENU.
        function setInteraction(toClear) {
            if (toClear) {
                embedFieldsObj.splice(0, embedFieldsObj.length);
                selectPersonaObj.splice(0, selectPersonaObj.length); // for setting the properties of the select menu
            };
            embedFieldsObj = [{ name: '\n', value: '\n' }]; // first object is for spacing
            selectPersonaObj = [];
        };

        // Fetch each persona data from db and dynamically append into EMBED and SELECT MENU.
        function populateInteraction(data) {
            Object.keys(data).forEach(key => {
                const value = data[key];
                const embedRows = {
                    name: key,
                    value: value
                };

                embedFieldsObj.push(embedRows);

                const objRows = {
                    label: key,
                    description: value,
                    value: key
                };

                selectPersonaObj[key] = objRows;
            });
        };

        // Fetch latest persona data from db, then set up the interaction fields and populate them.
        fetchPersonaData();
        setInteraction();
        populateInteraction(channelPersonas);

        // To dynamically retrieve and insert the channel's personas as options into the menu.
        const menuOptions = function(data, curPersona) {
            return Object.keys(data).map((personas) => {
                const personaKey = data[personas];
                return new StringSelectMenuOptionBuilder({
                    label: personaKey.label,
                    description: personaKey.description,
                    value: personaKey.value,
                    default: curPersona == personaKey.label ? true : false
                })
            });
        };

        // Create embed to display persona list.
        const embedView = (embedFields, curModel) => {
            return new EmbedBuilder({
                title: `${personaEmoji} Mash Personas in '#${interaction.channel.name}'`,
                description: `${currentEmoji} ${bold('Current Persona:')} ${italic(curModel)}`,
                fields: embedFields,
                timestamp: new Date().toISOString(),
            }).setColor(colors.botColor).addFields({ name: '\n', value: '\t' });
        };

        // Create the select menu interaction with recent retrevial of current persona.
        const selectPersonaMenu = function(curPersona) {
            return new StringSelectMenuBuilder({
                customId: 'selectPersonaMenu',
                placeholder: 'Select a Persona...',
                min_values: 0,
                max_values: 1,
            }).setOptions(menuOptions(selectPersonaObj, curPersona));
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
            embeds: [embedView(embedFieldsObj, getCurrentPersona)],
            components: [addActionRow(selectPersonaMenu(getCurrentPersona)), addActionRow(newPersona, editPersona, deletePersona)],
            ephemeral: true
        });

        function updateReply(state, contentMessage, curPersona, isUpdateValid) {
            fetchPersonaData();
            // Check if component consists of an interaction, if yes then update menu to latest selection.
            let checkCurPersona = curPersona || getCurrentPersona;

            // To update the select menu with user's selection.
            const newSelectMenu = selectPersonaMenu(checkCurPersona);

            if (state === 'collecting') {                
                return reply.edit({
                    content: italic(contentMessage),
                    embeds: [embedView(embedFieldsObj, checkCurPersona)],
                    components: [addActionRow(newSelectMenu), addActionRow(newPersona, editPersona, deletePersona)]
                });
            };
            
            if (state === 'end') {
                reply.delete();
                return interaction.followUp({ // can also swap with .channel.send
                    embeds: [embedView(embedFieldsObj, checkCurPersona).setTitle('\t').setFields({ name: `\n`, value: `${italic(contentMessage)}` }).setColor(colors.timeoutColor)],
                    components: []
                });
            };

            if (state === 'update') {
                setInteraction(true);
                fetchPersonaData();
                populateInteraction(db.readJSONData('personas', channelID));

                // To check if persona operations is successful or not, if not then make sure to not update with updated value as it's falsy.
                if (isUpdateValid && isUpdateValid !== true) { checkCurPersona = getCurrentPersona };
                pushConversation(checkCurPersona);
                
                return reply.edit({
                    content: '',
                    embeds: [embedView(embedFieldsObj, checkCurPersona)],
                    components: [addActionRow(newSelectMenu.setOptions(menuOptions(selectPersonaObj, checkCurPersona))), addActionRow(newPersona, editPersona, deletePersona)]
                });
            };
        };

        // Retrieves the user selection.
        const collector = reply.createMessageComponentCollector({
            filter: (i) => i.user.id === interaction.user.id && (i.isButton() || i.isStringSelectMenu()),
            idle: 60_000,
        });

        // Listen for interaction that matches the collector's filter conditions.
        collector.on('collect', async (interaction) => {
            console.log(`\n-----------------------------------------------------------------------------------------------------------------------\n`);
            console.log(`Interaction custom ID: ${interaction.customId}\nInteraction ID: ${interaction.id}\n`);
            console.log(`Interaction Values: ${interaction.values}\nCurrent Persona on Collect: ${getCurrentPersona}\n`);

            if (interaction.isButton()) {
                switch (interaction.customId) {
                    case "newPersona":
                        await personaOpsHandler('new', `newPersonaModal-${interaction.id}`);
                        break;
                    case "editPersona":
                        await personaOpsHandler('edit', `editPersonaModal-${interaction.id}`);
                        break;
                    case "deletePersona":
                        await personaOpsHandler('delete', `deletePersonaModal-${interaction.id}`);
                        break;
                    default:
                        console.log(`Unhandled button customId ${interaction.customId}`);
                        break;
                };
            } else if (interaction.isStringSelectMenu()) {
                fetchPersonaData();
                // Defer update for select menu interactions
                await interaction.deferUpdate();
                // check if the user did not select any options from the menu
                if (!interaction.values.length) {
                    db.updateData(channelID, 'currentPersona', defaultPersona);
                    fetchPersonaData();
                    pushConversation(getCurrentPersona);
                    await updateReply('collecting', `You have emptied your selection, persona reverted to Default.`, getCurrentPersona);
                    return;
                };
                
                // Updates the currentPersona with the user selected persona
                db.updateData(channelID, 'currentPersona', interaction.values.toString());
                fetchPersonaData();
                pushConversation(getCurrentPersona);
                await updateReply('collecting', `You have successfully selected '${bold(interaction.values)}: ${bold(channelPersonas[interaction.values])}'`, interaction.values);
            } else {
                console.log(`ERROR: Unhandled interaction type (${interaction.type})`);
            };

            // Functions to handle create, update, and delete operations according to button interactions.
            async function personaOpsHandler(interactionType, modalId) {
                fetchPersonaData();
                // Check if it is in 'edit' or 'delete' modal, and if interaction value is undefined (usually is when first time using command).
                const retrieveValue = (value) => {
                    return (interactionType !== 'new') ? value : '';
                };

                // Handle modal builder based on interaction type.
                try {
                    const personaModal = new ModalBuilder({
                        customId: `${pModal.modalPersona[interactionType].customId}-${interaction.id}`,
                        title: pModal.modalPersona[interactionType].title
                    });

                    const personaNameInput = new TextInputBuilder({
                        customId: 'personaNameInput',
                        label: pModal.nameInput[interactionType].label,
                        placeholder: pModal.placeholderText.name,
                        value: retrieveValue(getCurrentPersona),
                        style: TextInputStyle.Short,
                        required: true
                    });
                    const personaDescriptionInput = new TextInputBuilder({
                        customId: 'personaDescriptionInput',
                        label: pModal.descriptionInput[interactionType].label,
                        placeholder: pModal.placeholderText.description,
                        value: retrieveValue(channelPersonas[getCurrentPersona]),
                        style: TextInputStyle.Paragraph,
                        required: true
                    });
                    const deletePersonaInput = new TextInputBuilder({
                        customId: 'deletePersonaInput',
                        label: pModal.deleteMsg.label,
                        placeholder: pModal.deleteMsg.placeholder,
                        style: TextInputStyle.Short,
                        required: true
                    });

                    const firstActionRow = new ActionRowBuilder().addComponents(personaNameInput);
                    const secondActionRow = new ActionRowBuilder().addComponents(personaDescriptionInput);
                    const thirdActionRow = new ActionRowBuilder().addComponents(deletePersonaInput);
            
                    personaModal.addComponents(firstActionRow, secondActionRow);
                    if (interactionType === 'delete') { personaModal.components.push(thirdActionRow) };

                    await interaction.showModal(personaModal);

                    return modalSubmitHandler(modalId);

                } catch(error) {
                    console.error(`MODAL ERROR: ${error}`);
                };
            };

            function modalSubmitHandler(modalId) {
                fetchPersonaData();

                // Create embed to display modal feedbacks.
                const embedFeedback = new EmbedBuilder({
                    timestamp: new Date().toISOString(),
                });
                
                interaction
                    .awaitModalSubmit({
                        filter: (i) => i.user.id === interaction.user.id && i.customId === modalId,
                        time: 60_000,
                    })
                    .then((modalInteraction) => { // Handle modal submit behaviour.
                        const personaNameValue = modalInteraction.fields.getTextInputValue('personaNameInput');
                        const personaDescriptionValue = modalInteraction.fields.getTextInputValue('personaDescriptionInput');

                        const embedReply = (replyType, setTitle, setDescription, setColor) => {
                            const defDescription = `${bold('Name:')} ${italic(personaNameValue)}\n${bold('Description:')} ${italic(personaDescriptionValue)}`;
                            const checkDescription = setDescription === 'default' ? defDescription : setDescription;
                            const description = modalId === `deletePersonaModal-${interaction.id}` ? strikethrough(checkDescription) : checkDescription;
                            let color;
                            
                            if (replyType === 1) {
                                color = setColor || colors.successColor;
                                return modalInteraction.reply({ 
                                    embeds: [
                                        embedFeedback
                                            .setTitle(setTitle)
                                            .setDescription(description)
                                            .setColor(color)
                                    ]
                                });
                            } else if (replyType === 2) {
                                color = setColor || colors.failureColor;
                                return modalInteraction.reply({
                                    embeds: [embedFeedback.setTitle(setTitle).setColor(color)]
                                });
                            };
                        };
                        
                        if (modalId === `newPersonaModal-${interaction.id}`) {
                            const addNewStmt = db.editJSONData('personas', 'insert', channelID, personaNameValue, personaDescriptionValue);

                            if (addNewStmt === true) {
                                embedReply(1, `Persona '${personaNameValue}' has been successfully ${italic('created')}:\n`, 'default');
                            } else {
                                embedReply(2, `${italic(addNewStmt)}`);
                            };
                            return updateReply('update');
                        };

                        if (modalId === `editPersonaModal-${interaction.id}`) {
                            const editStmt = db.editJSONData('personas', 'update', channelID, getCurrentPersona, channelPersonas[getCurrentPersona], personaNameValue, personaDescriptionValue);
                            
                            if (editStmt === true) {
                                embedReply(1, `Persona '${getCurrentPersona}' has been successfully ${italic('edited')} to:\n`, 'default');
                            } else {
                                embedReply(2, `${italic(editStmt)}`);
                            };
                            return updateReply('update', null, personaNameValue, editStmt);
                        };
                        
                        if (modalId === `deletePersonaModal-${interaction.id}`) {
                            const deletePersonaValue = modalInteraction.fields.getTextInputValue('deletePersonaInput').toLowerCase();
                            
                            if (bot.yesInputs.includes(deletePersonaValue)) {
                                const deleteStmt = db.editJSONData('personas', 'delete', channelID, getCurrentPersona);

                                if (deleteStmt === true) {
                                    embedReply(1, `Persona '${getCurrentPersona}' has been successfully ${italic('deleted')}:\n`, 'default');
                                } else {
                                    embedReply(2, `${italic(deleteStmt)}`);
                                };
                            } else if (bot.noInputs.includes(deletePersonaValue)) {
                                embedReply(2, `${italic('Deletion Cancelled.')}`);
                            } else {
                                embedReply(1, `${italic('Invalid Input: Deletion Failed.')}\n`, `${italic(`Please enter either 'Yes/y' or 'No/n'.`)}`, colors.failureColor);
                            };
                            return updateReply('update');
                        };
                    })
                    .catch((error) => {
                        let modalType;
                        switch (modalId) {
                            case `newPersonaModal-${interaction.id}`:
                                modalType = 'New Persona';
                                break;
                            case `editPersonaModal-${interaction.id}`:
                                modalType = 'Edit Persona';
                                break;
                            case `deletePersonaModal-${interaction.id}`:
                                modalType = 'Delete Persona';
                                break;
                            default:
                                modalType = 'Unknown';
                                break;
                        };

                        if (error.code === 'InteractionCollectorError') {
                            interaction.followUp({
                                embeds: [embedFeedback.setTitle(`'${italic(modalType)}' ${italic('Modal has been timed out due to inactivity.\n')}`).setColor(colors.timeoutColor)],
                                ephemeral: true
                            });
                        };
                        console.error(`ERROR (${modalId}): ${error}\n`);
                    });
            };
        });

        collector.on('end', async (collected, reason) => {
            if (reason === 'idle') {
                console.log(`Collected ${collected.size} interactions.`);
                await updateReply('end', `Your 1 minute selection period is over, selection menu has been closed.\nUse ${inlineCode('/persona')} to use the menu again.`);
            }
        });
    },
};