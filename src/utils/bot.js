// Importing necessary classes and files.
require('dotenv/config');
const { 
    Client,
    Events,
    Collection,
    GatewayIntentBits,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle,
    bold, italic, strikethrough, inlineCode} = require('discord.js');
const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');

const db = require('./database.js');

const config = require('../../botConfig.json');
const models = config.GenerationModels;
const imageModels = models.ImageModels;

// Create new Client instance.
const client = new Client({ intents: ['Guilds', 'GuildMembers', 'GuildMessages', 'MessageContent'] });

// Configure OpenAI key to send API requests.
const openai = new OpenAI({
    apiKey: process.env.OPENAI_KEY, 
});

// Array of potential input options.
const yesInputs = ['Yes', 'yes', 'ye', 'y', '1'];
const noInputs = ['No', 'no', 'n', '0'];
const posStringInputs = ['All', 'all', 'a'];

// Bot's colors.
const colors = {
    botColor: 'Random',
    successColor: 0x5db77b,
    failureColor: 0xc13748,
    timeoutColor: 0x80687f
};

const toTitleCase = (input) => {
    return input.charAt(0).toUpperCase() + input.slice(1);
};

const getModelName = () => {
    return Object.keys(imageModels).find(key => imageModels[key] === model.toString());
};

// Check if bot has ever been used in this channel by its existence in the db.
function checkEnabled(channelID) {
    const retrieveRow = db.readDataBy('id', channelID);
    const checkRow = retrieveRow ? true : false;

    if (!checkRow) {
        // Create embed to display message.
        const embedMessage = new EmbedBuilder({
            title: `Seems like Mash hasn't been enabled in this channel yet.`,
            description: `To enable Mash, use the command ${bold('/mash')}.`,
            timestamp: new Date().toISOString(),
        }).setColor(colors.failureColor);

        return embedMessage;
    } else {
        return;
    };
};

// Create button builder.
const buttonBuilder = (customId, label, style, emoji, interacted) => {
    let buttonStyle = style || ButtonStyle.Secondary;
    if (interacted && interacted === customId) buttonStyle = ButtonStyle.Primary;

    const button = new ButtonBuilder()
        .setCustomId(customId)
        .setLabel(label)
        .setStyle(buttonStyle);

    if (emoji) button.setEmoji(emoji);

    return button;
};
        
// Handle error message printing.
let errorLog = [];
const errorEmbed = (errorLog, title, description) => {
    const splitErrorLog = errorLog ? errorLog.join('\n\n') : '';
    const errorPrinting = splitErrorLog ? '```' + splitErrorLog + '```' : '';
    title = title || 'Sorry! We\'ve encountered some error(s).';
    description = description ? description + '\n' + errorPrinting : errorPrinting;

    // Empty error logs if previous error has been logged.
    errorLog.length = 0;
    return new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(colors.failureColor)
        .setTimestamp();
};
                                
// Return follow up embed reply if encountered an error.
const inputErrorEmbed = (value, description) => {
    const errorMessage = `You entered: ${bold(inlineCode(value))}\n` + description;
    
    // Empty error logs if previous error has been logged.
    if (errorLog.length > 0) errorLog.length = 0;
    return {
        embeds: [
            new EmbedBuilder({
                title: `Sorry but you entered an invalid input!`,
                description: errorMessage,
                color: colors.failureColor,
            }).setTimestamp()
        ],
        ephemeral: true,
    };
};

// Calculate time difference in ms.
function startTimer(timeCreated) {
    // Get the current time
    const currentTime = new Date();

    // Calculate the time difference
    const timeDiff = currentTime - timeCreated;

    // Print the timer
    return `${timeDiff} ms`;
};

// Handles making sure the input width and height is valid to run the image generation.
function dimensionStandards(model, w, h, isInitial) {
    if (!Object.values(imageModels).includes(model)) {
        console.log('Invalid model\n');
        return errorLog.push('Invalid model:', model);
    };

    let minDimension;
    let dimensions;
    let isValid;
    let errorMessage = '';
    let toString;

    const format = (w, h = w, toString) => {
        if (model === imageModels['Dall·E 3'] || model === imageModels['Dall·E 2'] || toString) {
            return `${w}x${h}`;
        } else {
            return {
                width: w,
                height: h
            };
        };
    };
    
    switch(model) {
        case imageModels['Dall·E 3']:
            minDimension = 1024;
            toString = true;
            break;
        case imageModels['Dall·E 2']:
            minDimension = 512;
            toString = true;
            break;
        case imageModels['Stable Diffusion']:
        case imageModels['DreamShaper']:
            minDimension = 768;
            toString = false;
            break;
        default:
            console.log(`Invalid model: ${model}\n`);
            return;
    };

    if (isInitial || !w) {
        return format(minDimension, minDimension, toString);
    } else {
        let size = typeof w === 'string' ? w : w;
        let sizeSplit = typeof w === 'string' ? size.split('x') : NaN;
        let width = typeof w === 'number' ? w : parseInt(sizeSplit[0]);
        let height = typeof w === 'number' ? h : parseInt(sizeSplit[1]);

        dimensions = width < minDimension || height < minDimension 
            ? (isValid = false, format(minDimension))
            : (isValid = true, format(width, height));
        
        // Display input error embed if input is invalid.
        if (!isValid) {
            const readOnlyDimensions = typeof dimensions === 'object' ? `${dimensions.width}x${dimensions.height}` : dimensions;
            errorMessage += `${getModelName(model)} model ${bold(inlineCode('does NOT allow'))} sizes below ${bold(inlineCode(minDimension))}px.\n`;
            errorMessage += `\nI've adjusted the size to '${bold(inlineCode(readOnlyDimensions))}px' for this run.`;
            errorLog.push(errorMessage);
            // console.log(`\nInvalid dimensions: ${width}x${height}\nUpdated dimensions:`);
        };
    };
    // console.log(`${getModelName(model)}:`, dimensions, '\n');

    return dimensions;
};

async function outputNumStandards(model, numOutputs, isInitial) {
    let max;
    try {
        switch(model) {
            case imageModels['Dall·E 3']:
                max = 1;
                break;
            case imageModels['Dall·E 2']:
            case imageModels['Stable Diffusion']:
            case imageModels['DreamShaper']:
                max = 4;
                break;
            default:
                throw new Error(`Invalid model: ${model}\n`);
        };

        // Display input error embed if input is invalid.
        if (numOutputs > max) {
            if (!isInitial) {
                let errorMessage = '';

                if (model === imageModels['Dall·E 3']) errorMessage += `OpenAI's 'Dall·E 3' model ${bold(inlineCode('does NOT allow'))} more than ${bold(inlineCode(max))} output per generation.\n`;
                else errorMessage += `Expected an input between '1 to ${max}'\n`;

                errorMessage += `\nI've changed your number of output to '${bold(inlineCode('1'))}' for this run, you can change the number of outputs in '${bold(inlineCode('EditForm'))}'.`;
                errorLog.push(errorMessage);
            };

            return 1;
        };

        return numOutputs;
    } catch (error) {
        console.error('NUMBER OF OUTPUT INVALID:\n', error);
        errorLog.push(error);
        return;
    };
};

// Determine the scale factor for image upscaling based on width (& height).
function scaleCalc(width, height) {
    if (width === height) {
        switch (width) {
            case 256:
                return 4;
            case 512:
                return 2;
            case 768:
                return 1.33;
            case 1024:
                return 1;
            default:
                return 2;
        };
    } else {
        return 2;
    }
};

// To download image as PNG from url (for variation generation with OpenAI).
async function imageDownload(reason, imageUrl, channelID, messageID) {
    try {
        // Fetch the image data
        const response = await fetch(imageUrl);
        const imageArrayBuffer = await response.arrayBuffer();
        const imageBuffer = Buffer.from(imageArrayBuffer);

        // Create the folder if it doesn't exist
        const folderPath = path.join(__dirname, '..', 'log', 'images', channelID);
        if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath, { recursive: true });
        };

        // Remove the base URL from the imageUrl
        const url = new URL(imageUrl);
        const getUrlPath = url.href.length > 256 
            ? url.pathname.substring(url.pathname.lastIndexOf('/'))
            : url.host + url.pathname + url.search + url.hash;
        const cleanPath = getUrlPath.replace(/\/|-/g, '_');

        let fileName, imagePath, name;

        // Check if the imageUrl already exists in the folder
        const existingFiles = fs.readdirSync(folderPath);
        const existingImageUrl = existingFiles.find(file => {
            name = file.split('-');
            // console.log(name);
            return name[1].includes(cleanPath) ? true : false;
        });
    
        // Check for existing saved images url file name, to either update old file with latest gen & ID, or save if does not exist.
        !existingImageUrl
            ? fileName = `${messageID}-${cleanPath}`
            : fileName = `${name[0]}-${cleanPath}`;
        imagePath = path.join(folderPath, fileName);
    
        // If the file exists, update it with the new image data
        fs.writeFileSync(imagePath, imageBuffer);

        // If existing file is overrided, change the file name to latest messageID
        if (existingImageUrl) {
            const updatedFileName = `${messageID}-${cleanPath}`;
            const updatedPathName = path.join(folderPath, updatedFileName);
            fs.rename(imagePath, updatedPathName, (error) => {
                if (error) {
                    console.error('RENAMING ERROR:\n', error);
                    errorLog.push(error);
                    return;
                } else console.log('Rename complete!\n');
            });
            imagePath = updatedPathName;
            fileName = updatedFileName;
        };

        if (reason === 'getReadStream') return fs.createReadStream(imagePath);
        if (reason === 'getFileName') return fileName;
    } catch (error) {
        console.error('IMAGE DOWNLOAD ERROR:\n', error);
        errorLog.push(error);
        return;
    };
};

module.exports = {
    client,
    openai,
    yesInputs,
    noInputs,
    posStringInputs,
    colors,
    errorLog,
    toTitleCase,
    getModelName,
    checkEnabled,
    buttonBuilder,
    errorEmbed,
    inputErrorEmbed,
    startTimer,
    dimensionStandards,
    outputNumStandards,
    scaleCalc,
    imageDownload,
};