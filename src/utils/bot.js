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
    bold, italic, strikethrough } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');

const db = require('./database.js');
const config = require('../../botConfig.json');

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

// Check if bot has ever been used in this channel by its existence in the db.
function checkEnabled(channelID) {
    const retrieveRow = db.readDataBy('id', channelID);
    const checkRow = retrieveRow ? true : false;

    if (!checkRow) {
        // Create embed to display message.
        const embedMessage = new EmbedBuilder({
            title: `Seems like Bot-GPT hasn't been enabled in this channel yet.`,
            description: `To enable Bot-GPT, use the command ${bold('/botgpt')}.`,
            timestamp: new Date().toISOString(),
        }).setColor(colors.failureColor);

        return embedMessage;
    } else {
        return;
    };
};

// Create button builder.
const buttonBuilder = (customId, label, style, emoji) => {
    const button = new ButtonBuilder()
        .setCustomId(customId)
        .setLabel(label)
        .setStyle(style);

    if (emoji) button.setEmoji(emoji);

    return button;
};
        
// Handle error message printing.
const errorEmbed = (errorLog, title, description) => {
    const splitErrorLog = errorLog ? errorLog.join('\n\n') : '';
    const errorPrinting = splitErrorLog ? '```' + splitErrorLog + '```' : '';
    title = title || 'Sorry! We\'ve encountered some error(s).';
    description = description ? description + '\n' + errorPrinting : errorPrinting;

    return new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(colors.failureColor)
        .setTimestamp();
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
async function imageDownload(imageUrl) {
    // Fetch the image data
    const response = await fetch(imageUrl);
    const imageArrayBuffer = await response.arrayBuffer();
    const imageBuffer = Buffer.from(imageArrayBuffer);

    // Create the folder if it doesn't exist
    const folderPath = path.join(__dirname, '..', 'assets', 'variations');
    if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
    };

    // Save the image as a PNG file
    const fileName = `${path.basename(imageUrl, path.extname(imageUrl))}-${Date.now()}.png`;
    const imagePath = path.join(folderPath, fileName);

    fs.writeFileSync(imagePath, imageBuffer);
    return fs.createReadStream(imagePath)
};

module.exports = {
    client,
    openai,
    yesInputs,
    noInputs,
    posStringInputs,
    colors,
    checkEnabled,
    buttonBuilder,
    errorEmbed,
    startTimer,
    scaleCalc,
    imageDownload,
};