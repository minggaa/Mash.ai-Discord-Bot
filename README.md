# Mash - An AI Discord Bot

Have your very own personal generative assistant in your Discord server.

**Mash** is a generative AI bot powered by OpenAI and Replicate.ai, and built with Node.js.

## Features

### Chatting


### Image Generation


### Persona's


### Other

<br>

# Setup

If you wish to run this bot locally make sure to follow the steps below.

## Prerequisites

Make sure to fulfil each requirement or else your Mash would not be working as intended.

- Have some type of `IDE` or `code editor` installed. (VS Code is a great one)
- Make sure you have [Node.js](https://nodejs.org/en) installed (*Version 21.6.0 and above*)
- **`Clone` (Recommended) or `Download` this repository into your system.**
- Have a [Discord](https://discord.com/) account to use its [Developer portal](https://discord.com/developers/applications).
- Have an [OpenAI](https://platform.openai.com/apps) account to use its [Developer portal](https://openai.com/api/).
- Have a [Replicate.ai](https://replicate.com/) account.

## Step 1: Create Discord Bot: Mash

1. Go to https://discord.com/developers/applications > create a `New Application`.
2. Give your bot a name (make sure its 'Mash') and agree to the T&C.
3. Go to `Bot` > Token > and `Reset Token` to get the application token for your new Mash boy.

    <img width="65%" alt="Discord Token Example" src="https://github.com/user-attachments/assets/f8670fce-c72e-45f3-a6ab-1268d9ade2fa">

4. Navigate to the downloaded source file > go to `.env.example` and rename it to `.env` > Store your bot token under `CLIENT_TOKEN`.
    
    <img width="25%" alt="dotenv Discord Client_Token storage Example" src="https://github.com/user-attachments/assets/3d3c2376-a0d1-4bb1-9b64-773006634fc4">

5. Make sure to turn MESSAGE CONTENT INTENT `ON`.
6. Go to `OAuth2` > `OAuth2 URL Generator` > Select the `bot` and `applications.commands` options > Then configure all the necessary permissions for your Mash (You can set `Administrator` to allow all permissions).
7. Finally, invite your Mash to your server by copying the generated URL and enter through your browser.

## Step 2: Create OpenAI API Key

1. Go to your OpenAI Dashboard and `+ Create a new secret key` under [API Keys](https://platform.openai.com/api-keys)
2. Copy the key and store it in the `.env` file under `OPENAI_KEY`.

    <sub>*Refer to [Prerequisites](#Prerequisites) if you haven't already made an OpenAI account.*</sub>

## Step 3: Create Replicate.ai API Token

1. Go to [Replicate](https://replicate.com/) > Click on your profile name (on the top left) > `API Tokens` > Give your token a name then `Create Token`.
2. Copy the key and store it in the `.env` file under `REPLICATE_API_KEY`.

    <sub>*Refer to [Prerequisites](#Prerequisites) if you haven't already made a Replicate account.*</sub>

## Step 4: Setup Project Environment

1. Open your `terminal`.
2. Navigate to the cloned/downloaded project directory: `cd [directory]`.
3. Run `npm ci`<sup>[?](https://docs.npmjs.com/cli/v10/commands/npm-ci)</sup> to install all necessary dependencies.
4. Make sure all the necessary API/Token keys are correct and stored in your `.env` file, or else you wouldn't be able to use Mash's features.
5. Run `node deploy-commands.js` to deploy and/or update the Mash's commands to discord.
6. Now you're ready to run your very own **Mash** (bot) using:
    - **Default**: `npm start` or `node src/index.js`
    - **Nodemon**: `npm run server`

    <sub>*To end a running execution use <code>Ctrl</code> + <code>C</code>, or you can just end the terminal too.*</sub>

<br>

# Documentation

## Commands

- `/mash` Starts and pauses chatting feature with Mash.
- `/persona` Allows changing and editing of Mash's personality preset(s).
- `/models` Provides options to changing between different generative (Chat, Image) models.
- <details>
    <summary><code>/imaginate</code> Generates image using OpenAI (Dall·E) and Replicate models.</summary><br>

    | Input Fields | Description |
    | :----------- | :---------- |
    | `prompt`     | Instructions/prompts to generate image. |
    | `number`     | Number of images to generate. |
    | `size`       | Select or Enter a size for your image. <br><sub>*(Seperate width and height with an x, e.g: 1080x1080)*.</sub> |
    | `negprompt`  | Negative Prompts, things to avoid generating in your image. <span style="color:#a30b57">**\***</span> |
    | `scheduler`  | Select a scheduler. <span style="color:#a30b57">**\***</span> |
    | `refiner`    | Select a refiner. <span style="color:#a30b57">**\***</span> |

    <sub>***<span style="color:#a30b57">\*</span> Only for Replicate.ai models (Stable Diffusion, DreamShaper).***</sub>
</details>

- `/tokens` View tokens used for OpenAI models.


## Dependencies

- [Node.js](https://nodejs.org/en)
- npm
    - dotenv
    - openai
    - replicate
    - discord.js
    - better-sqlite3
- [OpenAI API Key](https://platform.openai.com/account/api-keys) - [Setup](https://platform.openai.com/docs/quickstart?context=node#:~:text=First%2C%20create%20an%20OpenAI%20account,not%20share%20it%20with%20anyone.)
- [Replicate.ai API Key](https://replicate.com/account/api-tokens) - [Setup](https://apidog.com/blog/replicate-api/#:~:text=pay%20a%20thing.-,Getting%20the%20Replicate%20API%20Token,-Before%20you%20start)
- [Discord Application Bot Key](https://discord.com/developers/applications/) - [Setup](https://discordjs.guide/preparations/setting-up-a-bot-application.html#creating-your-bot)
