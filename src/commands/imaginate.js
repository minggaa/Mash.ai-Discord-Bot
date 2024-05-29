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

// Define constants.
const repeatEmoji = emojis.repeatEmoji;
const sparkleEmoji = emojis.sparkleEmoji;
const wandEmoji = emojis.wandEmoji;
const editEmoji = emojis.editEmoji;

const sampleData = [
    { url: 'https://pngfre.com/wp-content/uploads/transparent-cat-by-pngfre-56-1.png', },
    { url: 'https://i.pinimg.com/originals/b2/54/25/b25425c4ab837d93826e0e19e4aa4945.png', },
    // { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Cute_Cat_with_Beautiful_Green_Eyes.png/1200px-Cute_Cat_with_Beautiful_Green_Eyes.png', },
    // { url: 'https://www.freepnglogos.com/uploads/cat-png/cat-sweety-white-brown-11.png', },
];

const sampleData2 = [
    'https://pngfre.com/wp-content/uploads/transparent-cat-by-pngfre-56-1.png',
    'https://i.pinimg.com/originals/b2/54/25/b25425c4ab837d93826e0e19e4aa4945.png',
    // 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Cute_Cat_with_Beautiful_Green_Eyes.png/1200px-Cute_Cat_with_Beautiful_Green_Eyes.png',
    // 'https://www.freepnglogos.com/uploads/cat-png/cat-sweety-white-brown-11.png',
];

// Get available images sizes from JSON.
const getSizes = Object.entries(imageSize).map(([name, value]) => ({
    name: value.toString(),
    value: value.toString(),
}));

module.exports = {
    data: new SlashCommandBuilder()
        .setName('imaginate')
        .setDescription('Let Bot-GPT generate your imaginations.')
        .addStringOption(
            option => option.setName('prompt')
                .setDescription('Prompt for your image.')
                .setRequired(true))
        .addIntegerOption(
            option => option.setName('number')
                .setDescription('Number of images to generate.')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(4)
        )
        .addStringOption(
            option => option.setName('size')
                .setDescription('Select a size for your image.')
                .setRequired(false)
				.addChoices(...getSizes)),
    async execute(interaction) {
        let prompt = interaction.options.getString('prompt');
        let number = interaction.options.getInteger('number') || 1;
        let size = interaction.options.getString('size') || imageSize.squareXS;
        let negPrompt = '';
        let seed;
        let response;
        let images;
        let count;
        let errorFlag;
        let getCurrentImageModel;
        let getPredictionId = 'mc6sphmzhsrgj0cfpqxb76gk50';
        let isNSFW = true;
        let isErrorStatus;
        let isSingledOut = (number > 1) ? false : true;

        const sizeSplit = size.split('x');
        const width = parseInt(sizeSplit[0]);
        const height = parseInt(sizeSplit[1]);
        const channelID = interaction.channelId.toString();
        const retrieveRow = db.readDataBy('id', channelID);
        const errorLog = [];
        const replicateInputJSON = {
            width: width,
            height: height,
            prompt: prompt,
            negative_prompt: negPrompt,
            num_outputs: number,
            scheduler: "K_EULER",
            disable_safety_checker: isNSFW,
        };

        // Check if bot has ever been used in this channel by its existence in the db.
        if (bot.checkEnabled(channelID)) {
            return await interaction.reply({
                embeds: [bot.checkEnabled(channelID)],
                ephemeral: true
            });
        };
        
        // Handle error message printing.
        const errorEmbed = (title, description) => bot.errorEmbed(errorLog, title, description);

        // Determine the scale factor for image upscaling based on width (& height).
        const scaleCalc = (width, height) => bot.scaleCalc(width, height);

        // To download image as PNG from url.
        const imageDownload = async(imageUrl) => bot.imageDownload(imageUrl);

        try {
            // Fetch OpenAI configuration.
            const openai = bot.openai;
            
            // Import, configure, and set up the Replicate API client.
            const { default: Replicate } = await import('replicate');
            const replicate = new Replicate({
                auth: process.env.REPLICATE_API_KEY,
            });
    
            // Fetches the latest state of current image model.
            function fetchCurrentImageModel() {
                getCurrentImageModel = db.readDataBy('id', channelID).currentImageModel;
                return getCurrentImageModel;
            };
    
            fetchCurrentImageModel();
            
            // Defer reply to allow time for the API to send response.
            // await interaction.deferReply();
            
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

            const runOpenAI = async() => {
                // Send request to the API to receive OpenAI's response.
                return await openai.images.generate({
                    model: getCurrentImageModel,
                    prompt: prompt,
                    n: number,
                    size: size,
                }).catch(async (error) => {
                    console.error('OpenAI ERROR:\n', error);
                    errorLog.push(error);
                    await interaction.editReply({ embeds: [errorEmbed(null, `${italic(`I'm having some trouble with the OpenAI API. Try again in a moment.`)}`)], files: [] });
                });
            };

            const runOpenAIVariation = async(imageUrl) => {
                return await openai.images.createVariation({
                    model: getCurrentImageModel,
                    image: imageUrl,
                    n: number,
                    size: size
                }).catch(async (error) => {
                    console.error('OpenAI ERROR:\n', error);
                    errorLog.push(error);
                    await interaction.editReply({ embeds: [errorEmbed(null, `${italic(`I'm having some trouble with the OpenAI API. Try again in a moment.`)}`)], files: [] });
                });
            };

            const runReplicate = async(model, input, numOutputs) => {
                model = model || getCurrentImageModel;
                numOutputs = numOutputs || number;
                input = input || replicateInputJSON;
                isSingledOut = (number > 1) ? false : true;

                if (input === replicateInputJSON) { replicateInputJSON.num_outputs = numOutputs };
                
                const onProgress = (prediction) => {
                    const timeCreated = new Date(prediction.created_at);
                    const lastLongLine = prediction.logs.split("\n").pop();
                    // getPredictionId = prediction.id;
                    console.log({id: prediction.id, status: prediction.status, time: bot.startTimer(timeCreated), log: lastLongLine});
                };

                return await replicate.run(model, { input }, onProgress)
                    .catch(async (error) => {
                        console.error('Replicate ERROR:\n', error);
                        errorLog.push(error);
                        await interaction.editReply({ embeds: [errorEmbed(null, `${italic(`I'm having some trouble with the Replicate API. Try again in a moment.`)}`)], files: [] });
                    });
            };

            const runReplicateVariation = async(imageUrl, input) => {
                input ? input.image = imageUrl : replicateInputJSON.image = imageUrl;
                const numOutputs = input ? input.num_outputs : 1;
                
                console.log(input);
                return await runReplicate(null, input, numOutputs);
            };

            const getPredictionSeed = async(predictionId) => {
                predictionId = predictionId || getPredictionId;
                const getPredictionData = await replicate.predictions.get(predictionId);
                seed = parseInt(getPredictionData.logs.split("\n")[0].split(": ")[1]);
                if (!seed) console.log('Unable to retrieve seed: Prediction data has expired.\n');
                // console.log(getPredictionData);
                console.log(seed);

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
            // console.log(modelSchema);
    
            // Sends image generation request to the respective API/client based on the current image model type.
            if (checkImgModelType('OpenAI')) {
                // Send request to the API to receive OpenAI's response.
                // response = await runOpenAI();
        
                // // Error handling for no response.
                // if (!response) {
                //     await interaction.editReply({ embeds: [errorEmbed(null, `${italic(`I'm having some trouble with the OpenAI API. Try again in a moment.`)}`)], files: [] });
                //     return;
                // };
                
                // const imageUrl = response.data;
                // console.log(imageUrl);

            } else if (checkImgModelType('Replicate')) {
                // response = await runReplicate();
                // console.log(response);
            };

            if (!response) response = sampleData2;
    
            // To get the generated image response(s) and display as embed.
            const getResponses = async (data, needFetch) => {
                images = [];
                errorFlag = false;
                const placeholderLink = 'https://www.placeholder.eg';

                if (!data) {
                    const noDataErrorMsg = 'ERROR: No data found.\n';
                    console.log(noDataErrorMsg);
                    errorLog.push(noDataErrorMsg);
                    return images = [errorEmbed()];
                }

                for (const key of Object.keys(data)) {
                    let description = `${bold('Prompt: ')}\n${prompt}`;
                    negPrompt ? description += `\n\n${bold('Negative Prompt: ')}\n${negPrompt}` : description;
                    seed ? description += `\n\n${bold('Seed: ')}\n${seed}` : description;

                    let value;
                    value = checkImgModelType('OpenAI')
                        ? data[key].url
                        : data[key];
                    
                    if (needFetch) { value = await getStatus(value) };

                    try {
                        const imageEmbed = images.length === 0 
                            ? new EmbedBuilder()
                                .setDescription(description)
                                .setURL(placeholderLink)
                                .setImage(value)
                                .setColor(colors.botColor)
                                .setTimestamp()
                            : new EmbedBuilder().setURL(placeholderLink).setImage(value);
                        images.push(imageEmbed);
                    } catch (error) {
                        console.error('URL RETRIEVAL ERROR:\n', error);
                        errorLog.push(error);
                        errorFlag = true;
                    };
                };

                if (errorFlag) images.push(errorEmbed());
                return images;
            };

            // Returns buttons needed for further interaction.
            const buttons = () => {
                const data = response;
                const actionRows = [];
                const variationActionRow = new ActionRowBuilder().addComponents();
                const upscalingActionRow = new ActionRowBuilder().addComponents();
                const variationSelectionActionRow = new ActionRowBuilder().addComponents();
                const upscaleImageSelectionActionRow = new ActionRowBuilder().addComponents();

                const rerollButton = bot.buttonBuilder(`reroll`, '\t', ButtonStyle.Secondary, repeatEmoji);
                const editFormButton = bot.buttonBuilder(`editForm`, '\t', ButtonStyle.Secondary, editEmoji);

                if (!data) return;
                
                count = 1;

                if (number > 1) {
                    Object.keys(data).forEach(key => {
                        const value = data[key].url;

                        const variationSelctionButton = bot.buttonBuilder(`variation-${count}`, `V${count}`, ButtonStyle.Secondary);
                        variationSelectionActionRow.components.push(variationSelctionButton);

                        const upscaleImageSelectionButton = bot.buttonBuilder(`upscale-${count}`, `U${count}`, ButtonStyle.Secondary);
                        upscaleImageSelectionActionRow.components.push(upscaleImageSelectionButton);

                        count++;
                    });

                    checkImgModelType('OpenAI')
                        ? variationSelectionActionRow.components.push(rerollButton, editFormButton)
                        : variationSelectionActionRow.components.push(rerollButton, editFormButton);
                    actionRows.push(variationSelectionActionRow, upscaleImageSelectionActionRow);

                } else { // CHANGE: when working on isVariationSelected feature
                    const varyButton = bot.buttonBuilder(`vary`, `Vary`, ButtonStyle.Secondary, wandEmoji);
                    checkImgModelType('OpenAI')
                        ? variationActionRow.components.push(varyButton, rerollButton)
                        : variationActionRow.components.push(varyButton, rerollButton, editFormButton);

                    const upscale1HxButton = bot.buttonBuilder(`upscaleX1.5`, `Upscale (x1.5)`, ButtonStyle.Secondary, sparkleEmoji);
                    const upscale2xButton = bot.buttonBuilder(`upscaleX2`, `Upscale (x2)`, ButtonStyle.Secondary, sparkleEmoji);
                    upscalingActionRow.components.push(upscale1HxButton, upscale2xButton);

                    actionRows.push(variationActionRow, upscalingActionRow);
                };

                return actionRows;
            };
            
            // To get image url status code (check if image url has expired).
            const getStatus = async(url) => {
                const request = new Request(url);

                const status = await fetch(request)
                    .then((response) => {
                        console.log(`(${url}) - code: ${response.status}`);
                        return response.status;
                    });
                return checkStatus(url, status);
            };

            const checkStatus = (url, status) => {
                const noImageUrl = 'attachment://no-image.png';
                let isFailure;

                if (status >= 200 && status <= 299) {
                    isFailure = false;
                } else if (status >= 400 && status <= 499) {
                    isErrorStatus = isFailure = true;
                    console.log('-   Image url has expired.\n');
                };
                
                return isFailure ? noImageUrl : url;
            };

            // Set loading animation for the image in generation.
            const loadingState = async(pos, isSingled, isInitial) => {
                const loading = new AttachmentBuilder('./src/assets/loading.gif');
                const setLocalImgUrl = 'attachment://loading.gif';
                let data = response;
                let returnData;

                if (isSingled) {
                    returnData = checkImgModelType('OpenAI')
                        ? data = { url: setLocalImgUrl }
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
                    embeds: await getResponses(returnData),
                    files: [loading],
                    components: [],
                };

                const loadingResponse = isInitial 
                    ? await interaction.reply(properties)
                    : await interaction.editReply(properties);
                
                return loadingResponse;
            };
            await loadingState(null, false, true);
    
            // Replies to the interaction with the generated image(s) & buttons.
            const interactionReply = async(data) => {
                const embed = await getResponses(data, true);
                const noImage = new AttachmentBuilder('./src/assets/no-image.png');
                let component;
                let file = [];

                (errorFlag) ? component = [] : component = buttons();
                
                if (isErrorStatus) {
                    component = [];
                    file = [noImage];
                };

                return await interaction.editReply({
                    embeds: embed,
                    components: component,
                    files: file
                });
            };
            const reply = await interactionReply(response);

            // Retrieves the user selection.
            const collector = reply.createMessageComponentCollector({
                filter: (i) => i.user.id === interaction.user.id && i.isButton(),
            });

            // Listen for interaction that matches the collector's filter conditions.
            collector.on('collect', async (interaction) => {

                if (interaction.isButton()) {
                    const varyIdSplit = interaction.customId.split('-');
                    const getCount = varyIdSplit[1];
                    let data = response;

                    // Update old image/loading gif with newly generated set of image(s).

                    // Receive user button input.
                    switch (interaction.customId) {
                        case `variation-${getCount}`:
                            console.log(`Variation ${getCount} button clicked`);
                            await interactionReply(await variationHandler(getCount, true));
                            break;
                        case `upscale-${getCount}`:
                            console.log(`Upscale ${getCount} button clicked`);
                            await interactionReply(await upscaleHandler(getCount));
                            break;
                        case `reroll`:
                            console.log(`Reroll button clicked`);
                            await interactionReply(await rerollHandler());
                            break;
                        case `editForm`:
                            console.log(`Edit Form button clicked`);
                            await displayEditImageForm(`editImageForm-${interaction.id}`);
                            break;
                        case `vary`:
                            console.log(`Vary button clicked`);
                            await interactionReply(await variationHandler(null, false));
                            break;
                        case `upscaleX1.5`:
                            console.log(`Upscale x1.5 button clicked`);
                            await interactionReply(await upscaleHandler(null, 1.5));
                            break;
                        case `upscaleX2`:
                            console.log(`Upscale x2 button clicked`);
                            await interactionReply(await upscaleHandler(null, 2));
                            break;
                        default:
                            console.log(`Unhandled button customId ${interaction.customId}\n`);
                    };

                    // Handle image variation generation.
                    async function variationHandler(pos, isMultiple, input, defer = true) {
                        if (defer) await interaction.deferUpdate();
                        let responseVariation, getVarUrl, imageUrl;
                        isSingledOut = isMultiple ? false : true;

                        if (checkImgModelType('OpenAI')) {
                            imageUrl = isMultiple ? data[pos-1].url : data[0];
                            console.log(imageUrl);
                            
                            await loadingState(pos);
                            
                            // Pass the PNG file to the OpenAI API
                            responseVariation = await runOpenAIVariation(await imageDownload(imageUrl));
                            getVarUrl = responseVariation.data[0].url;

                            if (isMultiple) {
                                data[pos-1].url = getVarUrl;
                            } else {
                                data[0].url = getVarUrl
                            };
                        } else if (checkImgModelType('Replicate')) {
                            imageUrl = isMultiple ? data[pos-1] : data[0];

                            await loadingState(pos);
                            responseVariation = await runReplicateVariation(imageUrl, input);
                            getVarUrl = (isMultiple && !pos) ? responseVariation : responseVariation[0];

                            if (isMultiple) {
                                (!pos) ? data = getVarUrl : data[pos-1] = getVarUrl;
                            } else {
                                data[0] = getVarUrl;
                            };
                        };

                        console.log(data);
                        return data;
                    };

                    async function upscaleHandler(pos, scale) {
                        await interaction.deferUpdate();
                        number = 1;
                        let responseUpscale, imageUrl;
                        scale = scale || scaleCalc(width, height);

                        imageUrl = pos 
                            ? (checkImgModelType('OpenAI')
                                ? data[pos-1].url
                                : data[pos-1])
                            : data[0];

                        const upscalerInput = {
                            image: imageUrl,
                            scale: scale
                        };
                        
                        await loadingState(null, true);
                        responseUpscale = await runReplicate(upscalerModel, upscalerInput, number);
                        data = [ responseUpscale ];

                        return data;
                    };

                    async function rerollHandler(input) {
                        await interaction.deferUpdate();
                        isSingledOut = false;
                        let responseReroll, getUrls;

                        await loadingState();
                        if (checkImgModelType('OpenAI')) { // need to get all the urls and download them
                            // console.log(data);
                            responseReroll = await runOpenAI();
                            getUrls = responseReroll.data;

                        } else if (checkImgModelType('Replicate')) {
                            responseReroll = await runReplicate(null, input, numOutputs);
                            getUrls = responseReroll;
                        };

                        data = getUrls;
                        return data;
                    };
                    
                    async function displayEditImageForm(id) {
                        // Handle modal builder based on interaction type.
                        try {
                            const editImageFormModal = new ModalBuilder({
                                customId: `editImageForm-${interaction.id}`,
                                title: 'Edit Image Form'
                            });
        
                            const promptActionRow = new ActionRowBuilder().addComponents(
                                new TextInputBuilder({
                                    customId: 'promptInput',
                                    label: 'Prompt',
                                    placeholder: 'A delicious plate of spagehetti in noir setting...',
                                    value: prompt,
                                    style: TextInputStyle.Paragraph,
                                    required: true
                                })
                            );
                            const negPromptActionRow = new ActionRowBuilder().addComponents(
                                new TextInputBuilder({
                                    customId: 'negPromptInput',
                                    label: 'Negative Prompt',
                                    placeholder: 'low res, blurry, poor lighting...',
                                    value: negPrompt,
                                    style: TextInputStyle.Paragraph,
                                    required: false
                                })
                            );
                            const seedActionRow = new ActionRowBuilder().addComponents(
                                new TextInputBuilder({
                                    customId: 'seedInput',
                                    label: 'Seed',
                                    placeholder: 'Random seed. Leave blank to randomize the seed',
                                    value: await getPredictionSeed(),
                                    style: TextInputStyle.Short,
                                    required: false
                                })
                            );
        
                            console.log(`In displayEditImageForm:\n    isSingledOut: ${isSingledOut}`);
                            const lastActionRow = new ActionRowBuilder().addComponents();
                            (isSingledOut) 
                                ? lastActionRow.components.push(
                                    new TextInputBuilder({
                                        customId: 'numOutputInput',
                                        label: 'Number of Output Images',
                                        placeholder: '1',
                                        value: 1,
                                        style: TextInputStyle.Short,
                                        required: true
                                    }))
                                : lastActionRow.components.push(
                                    new TextInputBuilder({
                                        customId: 'imagePosInput',
                                        label: 'Select Image to Regenerate',
                                        placeholder: `Select by Image Position Number or Regenerate 'All'`,
                                        style: TextInputStyle.Short,
                                        required: true
                                    }));
                    
                            editImageFormModal.addComponents(promptActionRow, negPromptActionRow, seedActionRow, lastActionRow);
        
                            await interaction.showModal(editImageFormModal);
        
                            return modalSubmitHandler(id);
        
                        } catch(error) {
                            console.error(`MODAL ERROR:\n`, error);
                        };
                    };

                    function modalSubmitHandler(id) {
                        interaction
                            .awaitModalSubmit({
                                filter: (i) => i.user.id === interaction.user.id && i.customId === id,
                                time: 120_000,
                            })
                            .then(async(modalInteraction) => {
                                await modalInteraction.deferUpdate();
                                const posStringInputs = ['All', 'all', 'a'];
                                let editedResponse;
                                
                                prompt = modalInteraction.fields.getTextInputValue('promptInput');
                                negPrompt = modalInteraction.fields.getTextInputValue('negPromptInput');
                                seed = parseInt(modalInteraction.fields.getTextInputValue('seedInput')) || NaN;
                                const numOutputValue = !isSingledOut ? 1 : parseInt(modalInteraction.fields.getTextInputValue('numOutputInput'));
                                let imagePosValue = isSingledOut ? undefined : modalInteraction.fields.getTextInputValue('imagePosInput');
                                
                                imagePosValue 
                                    ? (posStringInputs.includes(imagePosValue.toLowerCase())
                                        ? imagePosValue = 'reroll'
                                        : imagePosValue = parseInt(imagePosValue))
                                    : undefined;
                                
                                const input = {
                                    width: width,
                                    height: height,
                                    prompt: prompt,
                                    negative_prompt: negPrompt,
                                    num_outputs: numOutputValue,
                                    scheduler: "K_EULER",
                                    disable_safety_checker: isNSFW,
                                };

                                if (seed) input.seed = seed;

                                if (!isSingledOut) {
                                    if (imagePosValue === 'reroll') {
                                        editedResponse = await rerollHandler(input);
                                    }
                                    editedResponse = await variationHandler(imagePosValue, true, input, false);
                                } else {
                                    number = numOutputValue;
                                    const isMultiple = (number > 1) ? true : false;
                                    editedResponse = await variationHandler(imagePosValue, isMultiple, input, false);
                                };

                                return await interactionReply(editedResponse);
                            })
                            .catch((error) => {        
                                if (error.code === 'InteractionCollectorError') {
                                    return console.log(`${id} Timed out.\n`);
                                };
                                console.error(`ERROR (${id}):\n`, error);
                            });
                    };
                };
            });

        } catch(error) {
            console.error('ERROR:\n', error);
            errorLog.push(error);
            await interaction.editReply({ embeds: [errorEmbed()], files: [] });
        };
    },
};