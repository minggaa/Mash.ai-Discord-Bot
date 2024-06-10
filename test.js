// Importing necessary classes and files.
require('dotenv/config');
const fs = require('fs');
const db = require('./src/utils/database.js');
const bot = require('./src/utils/bot.js');

const config = require('./botConfig.json');
const pModals = config.personaModalsText;
const models = config.GenerationModels;
const imageModels = models.ImageModels;
const imageSize = config.ImageSizes;
const schemaFields = config.ReplicateSchemaField;

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

const sampleData3 = [
    'https://w0.peakpx.com/wallpaper/108/953/HD-wallpaper-cats-cat.jpg',
    'https://www.freepnglogos.com/uploads/cat-png/cat-sweety-white-brown-11.png',
];

const mockReturn1 = 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Cute_Cat_with_Beautiful_Green_Eyes.png/1200px-Cute_Cat_with_Beautiful_Green_Eyes.png';
const mockReturn2 = 'https://www.freepnglogos.com/uploads/cat-png/cat-sweety-white-brown-11.png';

// Persona data file config
// const personaData = fs.readFileSync('persona.json');
// const personaConfig = JSON.parse(personaData);

// const personaName = 'default';
// const selectedPersona = personaConfig.personas[personaName];

// console.log(personaConfig);

// Capitalise first letter of a string.
function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

// Check for persona.
// function getPersona() {
//     let personas = personaConfig.personas;
//     console.log('\n');
//     Object.keys(personas).forEach(function(key) {
//         return console.log(capitalizeFirstLetter(key) + ': ' + personas[key]);
//     })
//     console.log('\n');
// }
// getPersona()

// Check for persona.
function getPersona() {
    let personas = personaConfig.personas;
    let selectedPersona;

    Object.keys(personas).forEach(function (key) {
        if (key == personaName) {
            selectedPersona = personas[key];
        }
    });

    return selectedPersona;
}

// let status = { isEnabled: process.env.STATUS };

// console.log(status);

// if (status.isEnabled === 'true') {
//   console.log("enabled");
// } else {
//   console.log("disabled");
// }

// console.log(status.isEnabled);

// Call the function to read data from the database
const table = db.readAllFromTable();
const description = 'This is a test description.';
const description2 = 'Gugugaga test description 2!';
const cid = '1170253143767011409';


// Print the table contents
// console.log('\n-----------------------------------------------------------------------------------------------------------------------\nTable Contents:');
// console.log(table);
// console.log('-----------------------------------------------------------------------------------------------------------------------\nReturned Row:');
// db.insertNewData(cid, 0);
// console.log(db.checkColumn('currentModel', cid));
// console.log(db.channelExists(cid));
// console.log(db.readJSONData('formSettings', cid, 'refiner'));
// console.log(db.updateData(cid, 'currentPersona', 'Default'));
// console.log(db.deleteData('id', cid));
// console.log(db.deleteData(null, 'all'));
const deleteTestPersonas = (x) => {
    for (let i = 1; i <= x; i++) {
        const name = `Test${i}`;
        db.editJSONData('delete', cid, name, description);
    };
};
// deleteTestPersonas(20);

const getCurrentScheduler = db.readDataBy('id', cid).formSettings.scheduler;
const getCurrentRefiner = db.readDataBy('id', cid).formSettings.refiner;
const scheduler = schemaFields.scheduler;
const refiner = schemaFields.refiner;
// console.log(db.editJSONData('formSettings', 'update', cid, 'refiner', getCurrentRefiner, null, refiner[0]));
// db.updateData(cid, 'currentPersona', 'Test22');

// const addNewStmt = db.editJSONData('insert', cid, 'Testing', description);
// if (addNewStmt == true) {
//     console.log(`Your persona has been successfully created.`);
// } else {
//     console.log(addNewStmt);
// }

// console.log(db.readDataBy('id', cid));
// db.restoreDefault('formSettings', cid);
// console.log(/*`${getCurrentScheduler}\n${getCurrentrefiner}\n`,*/ db.readJSONData('formSettings', cid));

// const channelPersonas = db.readJSONData('personas', cid);
// const getCurrentPersona = db.readDataBy('id', cid).currentPersona;


let selectMenuObj = [];

function populateInteractions() {
    Object.keys(channelPersonas).forEach(key => {
        const value = channelPersonas[key];
        const objRows = {
            label: key,
            description: value,
            value: key,
            isDefault: getCurrentPersona == key ? true : false,
        };
        // console.log(`isDefault: ${objRows.isDefault}`);
        // selectMenuObj.push(objRows);
        selectMenuObj[key] = objRows;
    });
}

// populateInteractions();
// console.log(selectMenuObj);

// console.log(selectMenuObj[getCurrentPersona].isDefault);
// Object.keys(selectMenuObj).map((personas) => {
//     const value = selectMenuObj[personas];
//     if (value.isDefault) value.isDefault = false;
//     console.log(value.isDefault);
// });

// Object.keys(selectMenuObj).forEach(key => {
//     const specificVal = selectMenuObj[key] = getCurrentPersona;
//     console.log(specificVal);
//     if (key === 'label' && specificVal) {
//         return specificVal.isDefault = true;
//     }
// })

// console.log(channelPersonas);
// console.log(personaObj['salesperson']);

// let array = [ "item1", "item2", "item3", "item2" ];
// let previous = array[array.length - 2];

// console.log(`Previous val: ${previous}`);

// console.log(pModals.modalPersona.new.customId);
// console.log(models.gpt4T);

function penis() {
    const print = [];
    for (i in arguments) {
        print.push(arguments[i]);
    };
    return console.log(print);
};

// penis('we pis 1', 'we pis 2', 'we pis 3', 'we pis 4');

const replicateInputJSON = {
    width: 512,
    height: 512,
    prompt: 'cats',
    negPrompt: '',
    num_outputs: 1,
    scheduler: "K_EULER",
};

const runReplicate = async(input, numImg) => {
    numImg = numImg || 1;
    input = input || replicateInputJSON;
    isSingledOut = (numImg > 1) ? false : true;

    if (input === replicateInputJSON) { replicateInputJSON.num_outputs = numImg };

    return console.log(input);
};

const runReplicateVariation = async(imageUrl, input) => {
    input ? input.image = imageUrl : replicateInputJSON.image = imageUrl;
    
    return runReplicate(input, 1);
};

// replicateInputJSON.image = 'hehe.png';
// console.log(replicateInputJSON);
// runReplicate(null, 2);
// runReplicateVariation('hehecat.png');

let isSingledOut;
let isMultiple;
const number = 3;

const checkImageStatus = () => isSingledOut = !(isMultiple = (number > 1) ? true : false);
// checkImageStatus();
// console.log('Singled Out?: ', isSingledOut);
// console.log('Multiple?: ', isMultiple);

const check = (x) => {
    if (x) return true;
    else return false;
};

// console.log(check(1));

// console.log(bot.yesInputs.includes('yes'));
const checkInputOld = (type, input) => {
    const range = [ [1, 2, 3, 4], [1, 2, 3, 4, ...bot.posStringInputs] ];
    // check if input is within the range of image currently available
    if (range[type-1].includes(input)) {
        if (typeof input === 'number') return (input >= 1 && input <= number);
        if (typeof input === 'string') return range[type-1].includes(input);
    } else {
        return false;
    };
};

let x = 3;
const checkInput = (type, input) => {
    const range = [1, 2, 3, 4];
    const parsedInput = typeof input === 'string' ? parseInt(input) : input;

    // check if input is within the range of image currently available
    switch(type) {
        case 1:
            return range.includes(parsedInput) && (parsedInput >= 1 && parsedInput <= number);
        case 2:
            if (range.includes(parsedInput) && (parsedInput >= 1 && parsedInput <= number)) {
                x = parseInt(x);
                return true;
            };
            if (typeof input === 'string' && isNaN(parsedInput)) {
                const checkStrOptions = [...bot.posStringInputs].includes(input.toLowerCase());
                checkStrOptions ? x = 'reroll' : undefined;
                return checkStrOptions;
            };
            x = undefined;
            return false;
    };
};
// console.log(`\nOutput of input '${x}': ${checkInput(2, x)}\nType of '${x}': ${typeof x}\n`);

// How do I want my dimensions data to be returned?
// bot.dimensionStandards(imageModels['Dall·E 2'], '512x512');

module.exports = {
    sampleData,
    sampleData2,
    sampleData3,
    mockReturn1,
    mockReturn2,
};