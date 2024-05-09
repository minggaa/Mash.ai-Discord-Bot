// Importing necessary classes and files.
const { 
    SlashCommandBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ActionRowBuilder,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle,
    AttachmentBuilder,
    bold, italic, inlineCode} = require('discord.js');
const wait = require('node:timers/promises').setTimeout;

const db = require('../utils/database.js');
const bot = require('../utils/bot.js');
const colors = bot.colors;

const config = require('../../botConfig.json');
const modelsOpAI = config.OpenAIModels;
const imageSize = config.ImageSizes;

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
        ),
    async execute(interaction) {
        const prompt = interaction.options.getString('prompt');
        const number = interaction.options.getInteger('number') || 1;
        const channelID = interaction.channelId.toString();
        const retrieveRow = db.readDataBy('id', channelID);
        let getCurrentImageModel;

        // Check if bot has ever been used in this channel by its existence in the db.
        if (bot.checkEnabled(channelID)) {
            return await interaction.reply({
                embeds: [bot.checkEnabled(channelID)],
                ephemeral: true
            });
        };
        
        const errorEmbed = (title, description) => {
            return new EmbedBuilder()
                .setTitle(title)
                .setDescription(description)
                .setColor(colors.failureColor);
        };

        try {
            // Fetch OpenAI configuration.
            const openai = bot.openai;
    
            function fetchCurrentImageModel() {
                getCurrentImageModel = db.readDataBy('id', channelID).currentImageModel;
                return getCurrentImageModel;
            };
    
            fetchCurrentImageModel();
            
            await interaction.deferReply();
    
            // Send request to the API to receive OpenAI's response.
            const response = await openai.images.generate({
                model: getCurrentImageModel,
                prompt: prompt,
                n: number,
                size: imageSize.squareXS,
            }).catch((error) => console.error('OpenAI ERROR:\n', error));
            
            const imageUrl = response.data;
            console.log(imageUrl);
    
            // Error handling for no response.
            if (!response) {
                await interaction.editReply({ embeds: [errorEmbed(`Sorry!`, `${italic(`I'm having some trouble with the OpenAI API. Try again in a moment.`)}`)] });
                return;
            };
    
            const data = [
                { url: 'https://cdn.britannica.com/70/234870-050-D4D024BB/Orange-colored-cat-yawns-displaying-teeth.jpg', },
                { url: 'https://cdn.britannica.com/34/235834-050-C5843610/two-different-breeds-of-cats-side-by-side-outdoors-in-the-garden.jpg', },
                { url: 'https://cdn.britannica.com/16/218316-050-7C53C22A/European-wildcat-Felis-silvestris-prey.jpg', },
                { url: 'https://cdn.britannica.com/39/226539-050-D21D7721/Portrait-of-a-cat-with-whiskers-visible.jpg', },
            ];
    
            // To get the generated image response(s) and display as embed.
            const getResponses = (data) => {
                const images = [];
                const placeholderLink = 'https://www.placeholder.eg';
                Object.keys(data).forEach(key => {
                    const value = data[key].url;
                    const imageEmbed = images.length === 0 
                        ? new EmbedBuilder()
                            .setDescription(`${bold('Prompt: ')} ${inlineCode(prompt)}`)
                            .setURL(placeholderLink)
                            .setImage(value)
                            .setTimestamp()
                            .setColor(colors.botColor)
                        : new EmbedBuilder().setURL(placeholderLink).setImage(value);
                    images.push(imageEmbed);
                });
                return images;
            };
    
            await interaction.editReply({ 
                embeds: getResponses(imageUrl),
            });

        } catch(error) {
            console.error(`ERROR:\n${error}\n`);
            await interaction.editReply({ embeds: [errorEmbed('Apologies, but unfortunately an error occurred:', '```' + error + '```')] });
        };
    },
};