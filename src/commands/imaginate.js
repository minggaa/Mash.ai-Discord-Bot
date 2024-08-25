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
const models = config.GenerationModels;
const imageModels = models.ImageModels;
const upscalerModel = models.Upscaler['real-esrgan'];
const imageSize = config.ImageSizes;
const negPrompt = config.NegativePrompt;
const schemaFields = config.ReplicateSchemaField;

// Define constants.
const repeatEmoji = emojis.repeatEmoji;
const sparkleEmoji = emojis.sparkleEmoji;
const wandEmoji = emojis.wandEmoji;
const editEmoji = emojis.editEmoji;
const pinEmoji = emojis.pinEmoji;
const unpinEmoji = emojis.unpinEmoji;
const gearEmoji = emojis.gearEmoji;

// Get all available images sizes and Replicate schema properties from JSON.
const getSizes = Object.entries(imageSize).map(([name, value]) => value.toString());
const getArrayOptions = (array) => {
    return array.map((item) => ({
        name: item.toString(),
        value: item.toString(),
    }));
};

const optionMsg = `(Only for ${inlineCode('Stable Diffusion')} & ${inlineCode('DreamShaper')} models)`;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('imaginate')
        .setDescription('Let Mash generate your imaginations.')
        .addStringOption(
            option => option.setName('prompt')
                .setDescription('Prompt for your image.')
                .setRequired(true)
                .setMaxLength(1_000))
        .addIntegerOption(
            option => option.setName('number')
                .setDescription('Number of images to generate.')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(4))
        .addStringOption(
            option => option.setName('size')
                .setDescription('Select or Enter a size for your image. (Seperate width and height with an x).')
                .setRequired(false)
                .setAutocomplete(true))
        .addStringOption(
            option => option.setName('negprompt')
                .setDescription(`Negative Prompts to avoid in your image. ${optionMsg}`)
                .setRequired(false))
        .addStringOption(
            option => option.setName('scheduler')
                .setDescription(`Select a scheduler. ${optionMsg}`)
                .setRequired(false)
                .setChoices(...getArrayOptions(schemaFields.scheduler)))
        .addStringOption(
            option => option.setName('refiner')
                .setDescription(`Select a refiner. ${optionMsg}`)
                .setRequired(false)
                .setChoices(...getArrayOptions(schemaFields.refiner))),
    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused();
        const choices = [...getSizes];
        const filtered = choices.filter(choice => choice.startsWith(focusedValue));
        await interaction.respond(
            filtered.map(choice => ({ name: choice, value: choice })),
        );
    },
    async execute(interaction) {
        let prompt = interaction.options.getString('prompt');
        let number = interaction.options.getInteger('number') || 1;
        let size = interaction.options.getString('size');

        let sizeSplit;
        let width;
        let height;
        let negPrompt = interaction.options.getString('negprompt') || '';
        let seed = [];
        let scheduler = schemaFields.scheduler[0];
        let refiner = schemaFields.refiner[0];
        let isNSFW = false;
        let getPredictionId = [] ;

        let response;
        let images;
        let count;
        let errorFlag;
        let getCurrentImageModel;
        let getMessage;
        let latestMessage;
        let latestErrorEmbeds = [];
        let lastInteracted;
        let previousNumber;
        let clearPredictionId;
        let collector;
        let isErrorCode;
        let isSingledOut = (number > 1) ? false : true;
        let errorLog = bot.errorLog;
        let file = [];
        
        /* -----------------------------------------------------
        * Define Validation & Checking Functions & Executables.|
        -------------------------------------------------------*/
        const channelID = interaction.channelId.toString();
        
        // Check if bot has ever been used in this channel by its existence in the db.
        if (bot.checkEnabled(channelID)) {
            return await interaction.reply({
                embeds: [bot.checkEnabled(channelID)],
                ephemeral: true
            });
        };
    
        // Fetches the latest state of current image model.
        const fetchCurrentImageModel = () => {
            getCurrentImageModel = db.readDataBy('appStatus', 'id', channelID).currentImageModel;
            return getCurrentImageModel;
        };
        fetchCurrentImageModel();
            
        // Checks if the current image model type is 'OpenAI' or 'Replicate'.
        const checkImgModelType = (type) => {
            switch(type) {
                case "OpenAI":
                    if (getCurrentImageModel === imageModels['Dall·E 3']) return true;
                    if (getCurrentImageModel === imageModels['Dall·E 2']) return true;
                    break;
                case "Replicate":
                    if (getCurrentImageModel === imageModels['Stable Diffusion']) return true;
                    if (getCurrentImageModel === imageModels['DreamShaper']) return true;
                    break;
            }
            return false;
        };

        // Checks the minimum image dimensions for each model in use.
        const checkDimensions = async() => {
            const dimension = checkImgModelType('OpenAI')
                ? bot.dimensionStandards(getCurrentImageModel, size, null)
                : bot.dimensionStandards(getCurrentImageModel, width, height);

            if (errorLog.length > 0) {
                const invalidSize = checkImgModelType('OpenAI') ? size : `${width}x${height}`;
                latestErrorEmbeds.push(inputErrorEmbed(`${invalidSize}px`, errorLog));
            };

            if (checkImgModelType('OpenAI')) {
                size = dimension;
                sizeSplit = size.split('x');
                width = parseInt(sizeSplit[0]);
                height = parseInt(sizeSplit[1]);
            } else {
                width = dimension.width;
                height = dimension.height;
            };
        };

        const checkOutputNum = async(isInitial) => {
            const standardisedNumber = await bot.outputNumStandards(getCurrentImageModel, number, isInitial);
            if (errorLog.length > 0 && !isInitial) latestErrorEmbeds.push(inputErrorEmbed(`${number} number of outputs`, errorLog));
            number = standardisedNumber;
        };

        // Determine the scale factor for image upscaling based on width (& height).
        const scaleCalc = (width, height) => bot.scaleCalc(width, height);

        // To download image as PNG from url.
        const imageDownload = async(reason, imageUrl, message) => bot.imageDownload(reason, imageUrl, channelID, message.id);
        
        // Handle error message printing.
        const errorEmbed = (title, description) => bot.errorEmbed(errorLog, title, description);
        const inputErrorEmbed = (title, description) => bot.inputErrorEmbed(title, description);

        // Print error message.
        const printError = async(properties, messageType) => {
            if (typeof properties != 'object') {
                switch (properties) {
                    case 'replicateError':
                        properties = { embeds: [errorEmbed(null, `${italic(`I'm having some trouble with the Replicate API. Try again in a moment.`)}`)], files: [], };
                        break;
                    case 'openAIError':
                        properties = { embeds: [errorEmbed(null, `${italic(`I'm having some trouble with the OpenAI API. Try again in a moment.`)}`)], files: [], };
                        break;
                    case 'ephemeralError':
                        properties = { embeds: [errorEmbed()], files: [], components: [], ephemeral: true, };
                        break;
                    default:
                        properties = { embeds: [errorEmbed()], files: [], components: [], };
                        break;
                };
            };

            switch (messageType) {
                case 'followUp':
                    return interaction.replied
                        ? await interaction.followUp(properties)
                        : await interaction.reply(properties);
                default:
                    return interaction.replied
                        ? await latestMessage.edit(properties)
                        : await interaction.editReply(properties);
            };
        };

        try {
            /* -------------------------------------------------
            * (Import) Setup OpenAI & Replicate.ai API clients.|
            ---------------------------------------------------*/
            // Fetch OpenAI configuration.
            const openai = bot.openai;
            
            // Import, configure, and set up the Replicate API client.
            const { default: Replicate } = await import('replicate');
            const replicate = new Replicate({
                auth: process.env.REPLICATE_API_KEY,
            });

            /* -------------------------------
            * Define Functions & Executables.|
            ---------------------------------*/
            // Perform size and output number validation.
            await checkDimensions();
            await checkOutputNum();

            // Defines default/user preference for Replicate's generation options.
            const setOptions = () => {
                const getScheduler = interaction.options.getString('scheduler');
                const getRefiner = interaction.options.getString('refiner');
                const editOptionsData = (option, property, value) => db.editJSONData('formSettings', 'update', channelID, option, property, null, value);
                
                if (getScheduler) {
                    editOptionsData('scheduler', scheduler, getScheduler);
                    scheduler = getScheduler;
                };
                if (getRefiner) {
                    editOptionsData('refiner', refiner, getRefiner);
                    refiner = getRefiner;
                };
            };
            setOptions();

            // Defines Replicate's input JSON key value format.
            const replicateInputJSON = () => {
                let input = {
                    width: width,
                    height: height,
                    prompt: prompt,
                    negative_prompt: negPrompt,
                    num_outputs: number,
                    scheduler: scheduler,
                    refine: refiner,
                    disable_safety_checker: isNSFW,
                };
                return input
            };

            // Fetches the latest form settings values.
            const fetchFormSettings = (property) => {
                const formSettings = db.readDataBy('appStatus', 'id', channelID).formSettings;

                if (property) return formSettings[property];

                scheduler = formSettings.scheduler;
                refiner = formSettings.refiner;
                return;
            };
            fetchFormSettings();
            
            const fetchCurrentMessage = async() => {
                getMessage = await interaction.fetchReply();
            };
            
            // To get the generated image response(s) and display as embed.
            const getResponses = async (data, needFetch, loading) => {
                file = [], images = [], errorFlag = false;
                const placeholderLink = 'https://www.placeholder.eg';
                
                if (!data) {
                    const noDataErrorMsg = 'ERROR: No data found.\n';
                    console.log(noDataErrorMsg);
                    errorLog.push(noDataErrorMsg);
                    return images = [errorEmbed()];
                }

                for (const key of Object.keys(data)) {
                    let description = `${bold('Prompt: ')}\n${prompt}`, footer = '\t';
                    let field = [{ name: '\t', value: '\t' }];
                    negPrompt ? description += `\n\n${bold('Negative Prompt: ')}\n${negPrompt}` : description;
                    if (!loading) {
                        // Set seed details.
                        field = [];
                        if (seed.length === 1) {
                            field = [{ name: 'Seed', value: `${seed[0]}`, }];
                        } else if (seed.length > 1) {
                            for (let i = 0; i < seed.length; i++) {
                                if (i === 2) field.push({ name: `\t`, value: `\t` });
                                field.push({ name: `Seed ${i + 1}`, value: `${seed[i]}`, inline: true });
                            };
                        };

                        // Set footer details.
                        footer = getPredictionId.length > 0
                            ? getPredictionId.length > 1 ? footer = getPredictionId.toString().replace(/,/g, ', ') + '\n' : `${getPredictionId[0]}\n`
                            : '\t';
                        footer += `${bot.getModelName(getCurrentImageModel)}`;
                    };

                    let value;
                    value = checkImgModelType('Replicate')
                        ? data[key]
                        : data[key].url;
                    
                    if (needFetch) value = await getStatus(value);
                    if (!loading && !isErrorCode) {
                        const getFile = await imageDownload('getFileName', value, getMessage);
                        if (getFile === undefined) { // Displays errorEmbed if imageDownload runs into an error (by returning undefined)
                            errorFlag = true;
                            break;
                        };
                        const getPath = new AttachmentBuilder(`./src/log/images/${channelID.toString()}/${getFile}`);
                        file.push(getPath);
                        value = 'attachment://' + getFile;
                    };

                    try {
                        const imageEmbed = images.length === 0 
                            ? new EmbedBuilder()
                                .setDescription(description)
                                .setFields(field)
                                .setURL(placeholderLink)
                                .setImage(value)
                                .setColor(colors.botColor)
                                .setFooter({ text: footer })
                                .setTimestamp()
                            : new EmbedBuilder().setURL(placeholderLink).setImage(value);
                        images.push(imageEmbed);
                    } catch (error) {
                        console.error('EMBED SETTING ERROR:\n', error);
                        errorLog.push(error);
                        errorFlag = true;
                    };
                };

                if (errorFlag || isErrorCode) images.push(errorEmbed());
                return images;
            };

            // Returns buttons needed for further interaction.
            const buttons = async(displayInteracted) => {
                const data = response;
                if (!data) return;

                const isPinned = await isMsgPinned();
                const actionRows = [];
                const variationActionRow = new ActionRowBuilder().addComponents();
                const upscalingActionRow = new ActionRowBuilder().addComponents();
                const variationSelectionActionRow = new ActionRowBuilder().addComponents();
                const upscaleImageSelectionActionRow = new ActionRowBuilder().addComponents();
                const advancedActionRow = new ActionRowBuilder().addComponents();
                const extraActionRow = new ActionRowBuilder().addComponents();
                
                const buttonBuilder = (customId, label, style, emoji) => bot.buttonBuilder(customId, label, style, emoji, lastInteracted);
                const rerollButton = buttonBuilder(`reroll`, '\t', ButtonStyle.Secondary, repeatEmoji);
                const editFormButton = buttonBuilder(`editForm`, 'Edit Form', ButtonStyle.Secondary, editEmoji);
                const formSettingsButton = buttonBuilder(`formSettings`, 'Form Settings', ButtonStyle.Secondary, gearEmoji);
                const pinButton = buttonBuilder(`pin`, 'Pin', ButtonStyle.Secondary, pinEmoji);
                const unpinButton = buttonBuilder(`unpin`, 'Unpin', ButtonStyle.Secondary, unpinEmoji);

                // Ensure correct interaction button interface is shown when showing last interacted, and latest interaction button.
                let num = displayInteracted ? previousNumber : number;
                count = 1;

                if (num > 1) {
                    Object.keys(data).forEach(key => {
                        const variationSelctionButton = buttonBuilder(`variation-${count}`, `V${count}`, ButtonStyle.Secondary, null);
                        variationSelectionActionRow.components.push(variationSelctionButton);

                        const upscaleImageSelectionButton = buttonBuilder(`upscale-${count}`, `U${count}`, ButtonStyle.Secondary, null);
                        upscaleImageSelectionActionRow.components.push(upscaleImageSelectionButton);

                        count++;
                    });

                    variationSelectionActionRow.components.push(rerollButton);
                    actionRows.push(variationSelectionActionRow, upscaleImageSelectionActionRow);

                } else {
                    const varyButton = buttonBuilder(`vary`, `Vary`, ButtonStyle.Secondary, wandEmoji);
                    variationActionRow.components.push(varyButton, rerollButton);

                    const upscale1HxButton = buttonBuilder(`upscaleX1.5`, `Upscale (x1.5)`, ButtonStyle.Secondary, sparkleEmoji);
                    const upscale2xButton = buttonBuilder(`upscaleX2`, `Upscale (x2)`, ButtonStyle.Secondary, sparkleEmoji);
                    upscalingActionRow.components.push(upscale1HxButton, upscale2xButton);

                    actionRows.push(variationActionRow, upscalingActionRow);
                };
                
                lastInteracted = undefined; // reset last interacted value
                previousNumber = number; // update to current number
                checkImgModelType('OpenAI')
                    ? advancedActionRow.components.push(editFormButton)
                    : advancedActionRow.components.push(editFormButton, formSettingsButton);
                
                isPinned
                    ? extraActionRow.components.push(unpinButton)
                    : extraActionRow.components.push(pinButton);
                actionRows.push(advancedActionRow, extraActionRow);

                return actionRows;
            };
            
            // To get image url status code (check if image url has expired).
            const getStatus = async(url) => {
                try {
                    const request = new Request(url);

                    const status = await fetch(request)
                        .then((response) => {
                            console.log(`(${url}) - code: ${response.status}`);
                            return response.status;
                        });
                    return checkStatus(url, status);
                } catch (error) {
                    console.error('URL STATUS ERROR:\n', error);
                    errorLog.push(error);
                    errorFlag = true;
                };
            };

            const checkStatus = (url, status) => {
                const noImageUrl = 'attachment://no-image.png';
                const errorMessage = 'Image url has expired.';
                let isFailure;

                if (status >= 200 && status <= 299) {
                    isFailure = false;
                } else if (status >= 400 && status <= 499) {
                    isErrorCode = isFailure = true;
                    errorLog.push(errorMessage);
                    console.log(`- ${errorMessage}\n`);
                };
                
                return isFailure ? noImageUrl : url;
            };

            // Check if command message is pinned.
            const isMsgPinned = async() => {
                await fetchCurrentMessage();
                const isPinned = getMessage.pinned;
                return isPinned;
            };

            // Set loading animation for the image in generation.
            const loadingState = async(pos, isSingled, isInitial) => {
                const loading = new AttachmentBuilder('./src/assets/loading.gif');
                const setLocalImgUrl = 'attachment://loading.gif';
                let data = response;
                let returnData;

                // Only clears all if true, either replace one with specified ID position, or no clearing.
                if (checkImgModelType('Replicate')) {
                    const position = parseInt(pos);
                    clearPredictionId = clearPredictionId != false ? position || true : clearPredictionId;
                    if (clearPredictionId === false) getPredictionId = []; // To empty once before creating new set of predictions.
                };
                
                if (!isInitial) {
                    const lastInteractedButton = { components: await buttons(true) };
                    interaction.replied
                        ? await latestMessage.edit(lastInteractedButton)
                        : await interaction.editReply(lastInteractedButton);
                };

                if (isSingled) {
                    returnData = checkImgModelType('OpenAI')
                        ? data = [{ url: setLocalImgUrl }]
                        : data = [ setLocalImgUrl ];
                } else if (pos) {
                    checkImgModelType('OpenAI')
                        ? data[pos-1].url = setLocalImgUrl
                        : data[pos-1] = setLocalImgUrl;
                    returnData = data;
                } else {
                    // Use a temp array to store the loading GIF so it doesn't override the orginal data array for API use.
                    returnData = Array.from({ length: number }, () =>
                        checkImgModelType('OpenAI')
                            ? { url: setLocalImgUrl }
                            : setLocalImgUrl
                    );
                };

                const properties = {
                    embeds: await getResponses(returnData, false, true),
                    files: [loading],
                    components: [],
                };

                latestMessage = isInitial
                    ? interaction.replied || interaction.deferred
                        ? await interaction.followUp(properties)
                        : await interaction.reply(properties)
                    : await interaction.followUp(properties);
                
                if (latestErrorEmbeds) {
                    latestErrorEmbeds.forEach(async(property) => await interaction.followUp(property));
                    latestErrorEmbeds = [];
                };
                
                return latestMessage;
            };
            await loadingState(null, false, true);
            await fetchCurrentMessage();

            // Send request to the API to receive OpenAI's response.
            const runOpenAI = async() => {
                await checkDimensions();

                return await openai.images.generate({
                    model: getCurrentImageModel,
                    prompt: prompt,
                    n: number,
                    size: size,
                }).catch(async (error) => {
                    console.error('OpenAI ERROR:\n', error);
                    errorLog.push(error);
                    await printError('openAIError');
                });
            };

            const runOpenAIVariation = async(imageUrl, numOutputs) => {
                numOutputs = numOutputs || number;
                await checkDimensions();

                return await openai.images.createVariation({
                    model: getCurrentImageModel,
                    image: imageUrl,
                    n: numOutputs,
                    size: size
                }).catch(async (error) => {
                    console.error('OpenAI ERROR:\n', error);
                    errorLog.push(error);
                    await printError('openAIError');
                });
            };

            const runReplicate = async(model, input, numOutputs) => {
                if (clearPredictionId === true) getPredictionId = []; // To empty each time a new prediction is made.
                model = model || getCurrentImageModel;
                input = input || replicateInputJSON();
                numOutputs = numOutputs || number;

                input.num_outputs = numOutputs;

                await checkDimensions();
                input.width = width;
                input.height = height;
                
                const onProgress = (prediction) => {
                    const timeCreated = new Date(prediction.created_at);
                    const lastLongLine = prediction.logs.split("\n").pop();
                    if (!getPredictionId.includes(prediction.id)) {
                        getPredictionId.push(prediction.id);
                        if (typeof clearPredictionId === 'number' && clearPredictionId > 0) getPredictionId[clearPredictionId-1] = getPredictionId.pop();
                    };
                    console.log({id: prediction.id, status: prediction.status, time: bot.startTimer(timeCreated), log: lastLongLine});
                };

                console.log('In runReplicate:\n', input);
                return replicate.run(model, { input }, onProgress)
                    .catch(async (error) => {
                        console.error('Replicate ERROR:\n', error);
                        errorLog.push(error);
                        await printError('replicateError');
                    });
            };

            const runReplicateVariation = async(imageUrl, input) => {
                input ? input : input = replicateInputJSON();
                input.image = imageUrl
                const numOutputs = input.num_outputs || 1;
                
                return await runReplicate(null, input, numOutputs);
            };

            const getPredictionSeed = async(predictionId, noLog = false) => {
                predictionId = predictionId || getPredictionId;
                let getPredictionData;
                const checkId = interaction.customId?.includes('upscale') || false;
                const getSeed = async(id) => {
                    getPredictionData = await replicate.predictions.get(id)
                        .catch(async(error) => {
                            console.error('Replicate ERROR:\n', error);
                            errorLog.push(`Unable to fetch generation seed:\n  Invalid prediction ID: ${id}`, error);
                            await printError('ephemeralError', 'followUp');
                        });
                    const seedVal = parseInt(getPredictionData?.logs?.split("\n")[0].split(": ")[1]) || NaN;
                    if (!seedVal) {
                        const index = getPredictionId.indexOf(id);
                        getPredictionId[index] = undefined;
                    } else {
                        seed.push(seedVal);
                    };
                };
                
                if (!checkId && predictionId.length != 0) {
                    if (predictionId.length > 1) {
                        seed = []; // reset seed array
                        for (let id of predictionId) await getSeed(id);
                    } else {
                        seed = [];
                        await getSeed(predictionId[0]);
                    };
                };
                
                if (!noLog) {
                    seed.length === 0
                        ? !getPredictionData || getPredictionData?.data_removed
                            ? console.log('Unable to retrieve seed: Prediction data has expired.\n')
                            : console.log('Unable to retrieve seed.\n')
                        : console.log(seed);
                };
                
                return seed;
            };

            const getPredictionSchema = async() => {
                if (checkImgModelType('OpenAI')) return 'No schemas retrieved: Current Model is a part of OpenAI.\n';

                const model = getCurrentImageModel.split('/');
                const modelOwner = model[0];
                const modelName = model[1].split(':')[0];
                const versionId = model[1].split(':')[1];
                const getPredictionModel = await replicate.models.versions.get(modelOwner, modelName, versionId);
                const schema = getPredictionModel.openapi_schema.components.schemas.Input.properties;
                
                return schema;
            };
            const modelSchema = await getPredictionSchema();
    
            // Sends image generation request to the respective API/client based on the current image model type.
            if (checkImgModelType('OpenAI')) {
                // Send request to the API to receive OpenAI's response.
                const openAIResponse = await runOpenAI();

                // Error handling for no response.
                if (!openAIResponse) return await printError('openAIError');
                
                response = openAIResponse.data;

            } else if (checkImgModelType('Replicate')) {
                response = await runReplicate();
            };
    
            // Replies to the interaction with the generated image(s) & buttons.
            const interactionReply = async(data, isInitial) => {
                if (checkImgModelType('Replicate')) await getPredictionSeed(null);
                const embed = await getResponses(data, true);
                const noImage = new AttachmentBuilder('./src/assets/no-image.png');
                let component;

                (errorFlag) ? component = [] : component = await buttons();
                
                if (isErrorCode) {
                    component = [];
                    file = [noImage];
                };

                const properties = {
                    embeds: embed,
                    components: component,
                    files: file
                }

                if (isInitial) {
                    return interaction.replied
                        ? await latestMessage.edit(properties)
                        : await interaction.editReply(properties);
                } else {
                    setCollector();
                    return await latestMessage.edit(properties);
                }
            };
            await interactionReply(response, true);

            // Retrieves the user selection.
            const setCollector = () => {
                collector = latestMessage.createMessageComponentCollector({
                    filter: (i) => i.user.id === interaction.user.id && i.isButton(),
                    time: 895_000,
                });

                return collector;
            };
            setCollector();

            // Listen for interaction that matches the collector's filter conditions.
            collector.on('collect', async (interaction) => {

                if (interaction.isButton()) {
                    const varyIdSplit = interaction.customId.split('-');
                    const getCount = varyIdSplit[1];
                    
                    // Update previous interacted components first.
                    lastInteracted = interaction.customId;

                    // Receive user button input.
                    switch (interaction.customId) {
                        case `variation-${getCount}`:
                            console.log(`\nVariation ${getCount} button clicked`);
                            await interactionReply(await variationHandler(getCount, true));
                            break;
                        case `upscale-${getCount}`:
                            console.log(`\nUpscale ${getCount} button clicked`);
                            await interactionReply(await upscaleHandler(getCount));
                            break;
                        case `reroll`:
                            console.log(`\nReroll button clicked`);
                            await interactionReply(await rerollHandler());
                            break;
                        case `editForm`:
                            console.log(`\nEdit Form button clicked`);
                            await modalDisplayHandler(`editImageForm-${interaction.id}`);
                            break;
                        case `formSettings`:
                            console.log(`\nForm Settings button clicked`);
                            await modalDisplayHandler(`formSettings-${interaction.id}`);
                            break;
                        case `vary`:
                            console.log(`\nVary button clicked`);
                            await interactionReply(await variationHandler(null, false));
                            break;
                        case `upscaleX1.5`:
                            console.log(`\nUpscale x1.5 button clicked`);
                            await interactionReply(await upscaleHandler(null, 1.5));
                            break;
                        case `upscaleX2`:
                            console.log(`\nUpscale x2 button clicked`);
                            await interactionReply(await upscaleHandler(null, 2));
                            break;
                        case `pin`:
                        case `unpin`:
                            console.log(`\n${bot.toTitleCase(interaction.customId)} button clicked`);
                            await pinHandler();
                            break;
                        default:
                            console.log(`\nUnhandled button customId ${interaction.customId}\n`);
                    };

                    // Handle image variation generation.
                    async function variationHandler(pos, isMultiple, input, defer = true) {
                        let responseVariation, getVarUrl, imageUrl;
                        const defaultInputs = replicateInputJSON();

                        if (defer) if (!interaction.deferred) await interaction.deferUpdate();
                        else isSingledOut = isMultiple ? false : true;
                        
                        pos === 'reroll' ? pos = undefined : pos;

                        const getRequestUrls = (urls, numOutputs) => {
                            try {
                                const returnRequest = (getResponse) => {
                                    return getResponse.then(response => {
                                        const size = (data) => data.constructor != Array ? Object.keys(data.data).length : data.length;
                                        return checkImgModelType('OpenAI')
                                            ? size(response.data) > 1 ? response.data : response.data[0] 
                                            : size(response) > 1 ? response : response[0];
                                    });
                                };
    
                                if (checkImgModelType('OpenAI')) {
                                    const download = imageDownload('getReadStream', urls, getMessage);
                                    const response = download.then(stream => runOpenAIVariation(stream, numOutputs || 1));
                                    return returnRequest(response);
                                } else {
                                    input.num_outputs = numOutputs || 1; // For each referenced image, only require 1 output.
                                    const response = runReplicateVariation(urls, input);
                                    return returnRequest(response);
                                };
                            } catch (error) {
                                console.error('ERROR GETTING REQUEST URLS:\n', error);
                            };
                        };

                        const handleMultipleRequests = async() => {
                            const requests = []; // To push url for each referenced image.
                            if (imageUrl.length === number) {
                                if (checkImgModelType('OpenAI')) { // OpenAI API allows accurate image reference passing for variation, so image referenced can be generated concurrently.
                                    for (let data of imageUrl) requests.push(getRequestUrls(data.url, 1));
                                } else { // Replicate API only gets the latest image referenced rather than the individual specified images, unreliable to do it all concurrently so generate image referenced individually. (May change in future updates)
                                    getVarUrl = [], clearPredictionId = false; 
                                    for (let data of imageUrl) getVarUrl.push(await getRequestUrls(data, 1));
                                    return getVarUrl;
                                };
                            } else { // Handles generating variation based on single image referencing to multiple generated outputs.
                                requests.push(getRequestUrls(checkImgModelType('OpenAI') ? imageUrl[0].url : imageUrl[0], number));
                            };
                            getVarUrl = (await Promise.all(requests)).flat();
                            return getVarUrl;
                        };

                        if (checkImgModelType('OpenAI')) {
                            imageUrl = isMultiple ? pos ? response[pos-1].url : response : response[0].url;
                            
                            await loadingState(pos);
                            if (isMultiple && !pos) {
                                await handleMultipleRequests();
                            } else {
                                responseVariation = await runOpenAIVariation(await imageDownload('getReadStream', imageUrl, getMessage), 1);
                                getVarUrl = responseVariation.data[0].url;
                            };
                            
                            updateResponseUrl('OpenAI', isMultiple, pos, getVarUrl);
                            
                        } else if (checkImgModelType('Replicate')) {
                            imageUrl = isMultiple ? pos ? response[pos-1] : response : response[0];

                            await loadingState(pos);
                            if (isMultiple && !pos) {
                                await handleMultipleRequests();
                            } else {
                                if (!input) {
                                    defaultInputs.num_outputs = 1;
                                    input = defaultInputs;
                                };
                                responseVariation = await runReplicateVariation(imageUrl, input);
                                getVarUrl = responseVariation[0];
                            };
                            updateResponseUrl('Replicate', isMultiple, pos, getVarUrl);
                        };

                        return response;
                    };

                    async function upscaleHandler(pos, scale) {
                        await interaction.deferUpdate();
                        let responseUpscale, imageUrl;
                        number = 1, isSingledOut = true;
                        scale = scale || scaleCalc(width, height);

                        imageUrl = pos 
                            ? checkImgModelType('OpenAI')
                                ? response[pos-1].url
                                : response[pos-1]
                            : checkImgModelType('OpenAI')
                                ? response[0].url
                                : response[0];

                        const upscalerInput = {
                            image: imageUrl,
                            scale: scale
                        };
                        
                        await loadingState(null, true);
                        responseUpscale = await runReplicate(upscalerModel, upscalerInput, number);
                        response = checkImgModelType('OpenAI')
                            ? [{ url: responseUpscale[0] }]
                            : [ ...responseUpscale ];

                        return response;
                    };

                    async function rerollHandler(input, defer = true) {
                        if (defer) await interaction.deferUpdate();
                        
                        let responseReroll, getUrls;

                        await loadingState();
                        if (checkImgModelType('OpenAI')) {
                            responseReroll = await runOpenAI();
                            getUrls = responseReroll.data;

                        } else if (checkImgModelType('Replicate')) {
                            responseReroll = await runReplicate(null, input, number);
                            getUrls = responseReroll;
                        };

                        response = getUrls;
                        return response;
                    };

                    async function pinHandler() {
                        await interaction.deferUpdate();
                        const isPinned = await isMsgPinned();
                        
                        if (isPinned) {
                            await getMessage.unpin();
                        } else {
                            await getMessage.pin();
                        };
                        
                        return await interaction.editReply({
                            components: await buttons()
                        });
                    };

                    function updateResponseUrl(type, isMultiple, pos, url) {
                        switch (type) {
                            case 'OpenAI':
                                isMultiple
                                    ? (!pos)
                                        ? response = url
                                        : response[pos-1].url = url
                                    : response[0].url = url;
                                break;
                            case 'Replicate':
                                isMultiple
                                    ? (!pos) 
                                        ? response = url 
                                        : response[pos-1] = url
                                    : response[0] = url;
                                break;
                        };
                    };
                    
                    async function modalDisplayHandler(id) {
                        // Handle modal builder based on interaction type.
                        try {
                            let modalDisplay;

                            if (id === `editImageForm-${interaction.id}`) {
                                modalDisplay = new ModalBuilder({
                                    customId: `editImageForm-${interaction.id}`,
                                    title: 'Edit Image Form'
                                });
            
                                // Get the max character limit for image models.
                                const length = () => {
                                    switch (getCurrentImageModel) {
                                        case 'Dall·E 2':
                                            return 1000;
                                        default:
                                            return 4000;
                                    };
                                };

                                modalDisplay.addComponents(
                                    new ActionRowBuilder().addComponents(
                                        new TextInputBuilder({
                                            customId: 'promptInput',
                                            label: 'Prompt',
                                            placeholder: 'A delicious plate of spagehetti in a noir setting...',
                                            value: prompt,
                                            max_length: length,
                                            style: TextInputStyle.Paragraph,
                                            required: true
                                        })
                                    )
                                );
                                if (checkImgModelType('Replicate')) {
                                    modalDisplay.addComponents(
                                        new ActionRowBuilder().addComponents(
                                            new TextInputBuilder({
                                                customId: 'negPromptInput',
                                                label: 'Negative Prompt',
                                                placeholder: 'low res, blurry, poor lighting...',
                                                value: negPrompt,
                                                style: TextInputStyle.Paragraph,
                                                required: false
                                            })
                                        ),
                                        new ActionRowBuilder().addComponents(
                                            new TextInputBuilder({
                                                customId: 'seedInput',
                                                label: 'Seed (Leave blank to randomize the seed)',
                                                placeholder: 'Random seed',
                                                value: (await getPredictionSeed()).length === 1 ? seed[0] : '',
                                                style: TextInputStyle.Short,
                                                required: false
                                            })
                                        )
                                    )
                                };
                                const useImageActionRow = new ActionRowBuilder().addComponents(
                                    new TextInputBuilder({
                                        customId: 'useImageInput',
                                        label: 'Use Image as Reference',
                                        placeholder: `Enter 'Yes' or 'No'`,
                                        value: 'No',
                                        style: TextInputStyle.Short,
                                        required: true
                                    })
                                );
                                modalDisplay.addComponents(useImageActionRow);

                                if (getCurrentImageModel != imageModels['Dall·E 3']) {
                                    const imageOptionsActionRow = new ActionRowBuilder().addComponents();
                                    (isSingledOut) 
                                        ? imageOptionsActionRow.components.push(
                                            new TextInputBuilder({
                                                customId: 'numOutputInput',
                                                label: 'Number of Output Images',
                                                placeholder: '1',
                                                value: 1,
                                                max_length: 1,
                                                style: TextInputStyle.Short,
                                                required: true
                                            }))
                                        : imageOptionsActionRow.components.push(
                                            new TextInputBuilder({
                                                customId: 'imagePosInput',
                                                label: 'Select Image to Regenerate',
                                                placeholder: `Select by 'Image Position Number' or by 'All'`,
                                                max_length: 3,
                                                style: TextInputStyle.Short,
                                                required: true
                                            }));
                                    modalDisplay.addComponents(imageOptionsActionRow);
                                };
                            };

                            if (id === `formSettings-${interaction.id}`) {
                                fetchFormSettings();

                                modalDisplay = new ModalBuilder({
                                    customId: `formSettings-${interaction.id}`,
                                    title: 'Image Form Settings'
                                });

                                const schedulerActionRow = new ActionRowBuilder().addComponents(
                                    new TextInputBuilder({
                                        customId: 'schedulerInput',
                                        label: 'Scheduler (Default: "K_EULER")',
                                        placeholder: scheduler,
                                        value: scheduler,
                                        style: TextInputStyle.Short,
                                        required: true
                                    })
                                );
                                const refinerActionRow = new ActionRowBuilder().addComponents(
                                    new TextInputBuilder({
                                        customId: 'refinerInput',
                                        label: 'refiner (Default: "no_refiner")',
                                        placeholder: refiner,
                                        value: refiner,
                                        style: TextInputStyle.Short,
                                        required: true
                                    })
                                );
                                modalDisplay.addComponents(schedulerActionRow, refinerActionRow);
                            };
        
                            await interaction.showModal(modalDisplay);
        
                            return modalSubmitHandler(id);
        
                        } catch(error) {
                            console.error(`MODAL ERROR:\n`, error);
                            errorLog.push(error);
                            await printError('defaultError');
                        };
                    };

                    function modalSubmitHandler(id) {
                        interaction
                            .awaitModalSubmit({
                                filter: (i) => i.user.id === interaction.user.id && i.customId === id,
                                time: 600_000,
                            })
                            .then(async(modalInteraction) => {
                                await modalInteraction.deferUpdate();
                                let isMultiple;
                                let isUsingImage;
                                let editedResponse;
                                
                                // Return follow up embed reply if encountered an error from modal submission.
                                const replyModalError = async(value, description) => {
                                    const stylisedDescription = bold('Expected ' + description);
                                    return await modalInteraction.followUp(inputErrorEmbed(value, stylisedDescription));
                                };
                                
                                if (id === `editImageForm-${interaction.id}`) {
                                    // Retrieve input values from modal.
                                    prompt = modalInteraction.fields.getTextInputValue('promptInput');
                                    negPrompt = checkImgModelType('Replicate') ? modalInteraction.fields.getTextInputValue('negPromptInput') : undefined;
                                    const seedValue = checkImgModelType('Replicate') ? parseInt(modalInteraction.fields.getTextInputValue('seedInput')) || NaN : NaN;
                                    const useImageValue = modalInteraction.fields.getTextInputValue('useImageInput') || bot.noInputs[0];
                                    const numOutputValue = getCurrentImageModel != imageModels['Dall·E 3'] 
                                        ? !isSingledOut ? 1 : parseInt(modalInteraction.fields.getTextInputValue('numOutputInput'))
                                        : undefined;
                                    let imagePosValue = getCurrentImageModel != imageModels['Dall·E 3']
                                        ? isSingledOut ? undefined : modalInteraction.fields.getTextInputValue('imagePosInput')
                                        : undefined;

                                    // Check if user inputs valid value for num_outputs and image position number.
                                    const checkInput = (type, input) => {
                                        const range = [1, 2, 3, 4];
                                        const parsedInput = typeof input === 'string' ? parseInt(input) : input;
                                    
                                        // Checks if input is within the range of image currently available
                                        switch(type) {
                                            case 1:
                                                return range.includes(parsedInput) && (parsedInput >= 1 && parsedInput <= 4);
                                            case 2:
                                                // Checks if user inputs a number or 'All' option
                                                if (range.includes(parsedInput) && (parsedInput >= 1 && parsedInput <= number)) {
                                                    imagePosValue = parsedInput;
                                                    return true;
                                                };
                                                if (typeof input === 'string' && isNaN(parsedInput)) {
                                                    const checkStrOptions = [...bot.posStringInputs].includes(input.toLowerCase());
                                                    checkStrOptions ? imagePosValue = 'reroll' : undefined;
                                                    return checkStrOptions;
                                                };
                                                return false;
                                        };
                                    };

                                    if (getCurrentImageModel != imageModels['Dall·E 3']) {
                                        if (!checkInput(1, numOutputValue)) return await replyModalError(numOutputValue, `a 'valid' input between ${inlineCode('1 to 4')}.`);
                                        if (!checkInput(2, imagePosValue) && imagePosValue != undefined) return await replyModalError(imagePosValue, `a 'valid' selection between ${inlineCode(`1 to ${number}`)} or ${inlineCode(`'All'`)} to select all.`);
                                    };
                                    
                                    isUsingImage = bot.yesInputs.includes(useImageValue) ? true : bot.noInputs.includes(useImageValue) ? false : undefined;
                                    
                                    const checkImageStatus = () => isSingledOut = !(isMultiple = (number > 1) ? true : false);
                                    const runVariation = async() => await variationHandler(imagePosValue, isMultiple, input, false);
                                    const runDefault = async() => {
                                        await loadingState(imagePosValue);
                                        const res = checkImgModelType('OpenAI') ? await runOpenAI() : await runReplicate(null, input, numOutputValue);
                                        let getUrl;
                                        
                                        console.log(res);
                                        getUrl = (isMultiple && !imagePosValue)
                                            ? checkImgModelType('OpenAI')
                                                ? res.data
                                                : res
                                            : checkImgModelType('OpenAI')
                                                ? res.data[0].url
                                                : res[0];

                                        checkImgModelType('OpenAI')
                                            ? updateResponseUrl('OpenAI', isMultiple, imagePosValue, getUrl)
                                            : updateResponseUrl('Replicate', isMultiple, imagePosValue, getUrl);
                                        
                                        return response;
                                    };
                                    const input = {
                                        width: width,
                                        height: height,
                                        prompt: prompt,
                                        negative_prompt: negPrompt,
                                        num_outputs: numOutputValue,
                                        scheduler: scheduler,
                                        refine: refiner,
                                        disable_safety_checker: isNSFW,
                                    };

                                    if (seedValue) {
                                        input.seed = seedValue;
                                        seed = [seedValue];
                                    };

                                    if (isSingledOut) {
                                        number = getCurrentImageModel != imageModels['Dall·E 3'] ? numOutputValue : 1;
                                        checkImageStatus();
                                        editedResponse = isUsingImage ? await runVariation() : await runDefault();
                                    } else {
                                        checkImageStatus();
                                        editedResponse = imagePosValue === 'reroll' && !isUsingImage
                                            ? await rerollHandler(input, false)
                                            : isUsingImage
                                                ? await runVariation()
                                                : await runDefault();
                                    };
                                    
                                    return await interactionReply(editedResponse);
                                };
                                
                                if (id === `formSettings-${interaction.id}`) {
                                    const getScheduler = modalInteraction.fields.getTextInputValue('schedulerInput');
                                    const getRefiner = modalInteraction.fields.getTextInputValue('refinerInput').toLowerCase();
                                    let successMessage = '';

                                    // Input validation.
                                    if (!schemaFields.scheduler.includes(getScheduler)) return await replyModalError(getScheduler, `one of these options\n${'```\n- ' + schemaFields.scheduler.join('\n- ') + '\n```'}`);
                                    if (!schemaFields.refiner.includes(getRefiner)) return await replyModalError(getRefiner, `one of these options\n${'```\n- ' + schemaFields.refiner.join('\n- ') + '\n```'}`);

                                    // Update if all validations passed.
                                    const updateScheduler = db.editJSONData('formSettings', 'update', channelID, 'scheduler', scheduler, null, getScheduler);
                                    const updateRefiner = db.editJSONData('formSettings', 'update', channelID, 'refiner', refiner, null, getRefiner);
                                    
                                    // Fetch latest form settings updates & push changes as success messages.
                                    fetchFormSettings();
                                    if (updateScheduler === true) successMessage += `${bold('Scheduler')}: ${italic(scheduler)}  has been updated successfully\n`;
                                    if (updateRefiner === true) successMessage += `${bold('Refiner')}: ${italic(refiner)}  has been updated successfully\n`;

                                    // If successMessage is empty (no changes made) return undefined; else return follow up message.
                                    return successMessage === ''
                                        ? undefined
                                        : await modalInteraction.followUp({
                                            embeds: [
                                                new EmbedBuilder({
                                                    title: `Change successful.`,
                                                    description: successMessage,
                                                    color: colors.successColor,
                                                }).setTimestamp()
                                            ],
                                        });
                                };
                            })
                            .catch(async(error) => {
                                switch (error.code) {
                                    case 'InteractionCollectorError':
                                        return console.log(`${id} Timed out.\n`);
                                };
                                console.error(`ERROR (${id}):\n`, error);
                                errorLog.push(error);
                                await printError('defaultError');
                            });
                    };
                };
            });

            collector.on('end', async () => {
                // Prevent interaction failure before webhook token expires after the 15 minute time limit.
                await printError({ content: bold('Your 15 minute period has ended, interaction is now expired.'), components: [] });
            });

        } catch(error) {
            console.error('ERROR:\n', error);
            errorLog.push(error);
            await printError();
        };
    },
};