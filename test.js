// Importing necessary classes and files.
require('dotenv/config');
const fs = require('fs');
const db = require('./src/utils/database.js');
const pModals = require('./botConfig.json').personaModalsText;
const modelsOpAI = require('./botConfig.json').GenerationModels;

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
// console.log(db.readPersona(cid, 'Support'));
// console.log(db.updateData(cid, 'currentPersona', 'Default'));
// console.log(db.deleteData('id', cid));
// console.log(db.deleteData(null, 'all'));
// db.restoreDefaultPersonas(cid);
const deleteTestPersonas = (x) => {
    for (let i = 1; i <= x; i++) {
        const name = `Test${i}`;
        db.editPersona('delete', cid, name, description);
    };
};
// deleteTestPersonas(20);
// console.log(db.editPersona('update', cid, 'Support', description, 'Salesperson'));
// db.updateData(cid, 'currentPersona', 'Test22');

// const addNewStmt = db.editPersona('insert', cid, 'Testing', description);
// if (addNewStmt == true) {
//     console.log(`Your persona has been successfully created.`);
// } else {
//     console.log(addNewStmt);
// }

// console.log(db.readDataBy('id', cid));

const channelPersonas = db.readPersona(cid);
const getCurrentPersona = db.readDataBy('id', cid).currentPersona;
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
// console.log(modelsOpAI.gpt4T);

function penis() {
    const print = [];
    for (i in arguments) {
        print.push(arguments[i]);
    };
    return console.log(print);
};

penis('we pis 1', 'we pis 2', 'we pis 3', 'we pis 4');