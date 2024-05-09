// Importing necessary classes and files.
const Database = require('better-sqlite3');
const modelsOpAI = require('../../botConfig.json').OpenAIModels;
const chatModel = modelsOpAI.ChatModels;
const imageModel = modelsOpAI.ImageModels;

// Connect to the database.
const db = new Database('botgpt.db');

// Prepare database table.
db.prepare(`
    CREATE TABLE IF NOT EXISTS botStatus (
        channelID VARCHAR(255) NOT NULL PRIMARY KEY,
        isEnabled BOOLEAN DEFAULT 0 NOT NULL,
        personas TEXT NOT NULL,
        currentPersona VARCHAR(255) DEFAULT 'Default' NOT NULL,
        currentChatModel VARCHAR(255) DEFAULT '${chatModel['GPT-4 Turbo']}' NOT NULL,
        currentImageModel VARCHAR(255) DEFAULT '${imageModel['Dall·E 3']}' NOT NULL
    )
`).run();

const defaultData = {
    personas: {
        "Default": "BotGPT is a helpful and friendly assistant.",
        "Salesperson": "You are a friendly salesperson.",
        "Support": "A knowledgeable and supportive agent, with every reply you will end the sentence with howdy!."
    }
};
const nullVar = undefined || null;

// Writing JSON to the database.
const insertStatement = db.prepare('INSERT OR IGNORE INTO botStatus (channelID, isEnabled, personas, currentPersona, currentChatModel, currentImageModel) VALUES (?, ?, ?, ?, ?, ?)');

function restoreDefaultPersonas(channelID) {
    try {
        const insertPersonas = db.prepare('UPDATE botStatus SET personas = ? WHERE channelID = ?');
        insertPersonas.run(JSON.stringify(defaultData.personas), channelID);
        console.log(`Personas for channelID: ${channelID} has been successfully restored to default.\n`);
    } catch (error) {
        console.error(`ERROR: ${error}\n`);
    };
};

// CHECK if table exists in db.
function tableExists(tableName) {
    const checkStatement = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`).all();
    const isExist = checkStatement.length ? true : false; // retruns a list of existing tables, if tableName exists then true
    if (!isExist) {
        console.log('ERROR: unable to fetch any records as the table does not exist.\n');
        return isExist;
    };
    return isExist;
};

// CHECK if channelID exists in the db.
function channelExists(channelID) {
    const checkStatement = db.prepare('SELECT * FROM botStatus WHERE channelID = ? AND channelID IS NOT NULL').get(channelID);
    return !!checkStatement; // returns true or false
};

// CHECK if column exists in the db
function columnExists(columnName) {
    const query = db.prepare(`PRAGMA table_info(botStatus);`); // queries to get information on table, including columns
    const columns = query.all(); // gets all columns in array of objects
    for (const column of columns) {
        if (column.name === columnName) {
            return true;
        }
    }
    console.log('ERROR: unable to fetch any records as the column does not exist.\n');
    return false;
};

// CHECK for data validity of specified column.
function checkColumn(column, input) {
    const checkStatement = db.prepare(`SELECT ${column} FROM botStatus`);
    const columnType = checkStatement.columns().map(column => column.type.toLowerCase()); // extracts the data type of the input column
    let inputType;
    
    if ((typeof input == 'integer' || 'number') && (input == 0 || input <= 1)) {
        inputType = 'boolean';
    } else if (typeof input == 'number') {
        inputType = 'integer';
    } else if (typeof input == 'string') {
        inputType = 'varchar(255)';
    }

    // console.log(`${typeof input}\n${columnType}\ninput type: ${inputType}\ncolumn type: ${columnType}`);
    if (inputType != columnType) {
        console.log(`ERROR in updating the specified data due to a mismatch of data types in the table column.\n`);
        return false;
    } else {
        return true;
    }
};

// Check for the existence currentPersona.
function checkCurrentPersona(channelID, personaName, updatePName) {
    const selectStatement = db.prepare('SELECT personas FROM botStatus WHERE channelID = ?').get(channelID);
    const personaList = JSON.parse(selectStatement.personas);
    
    // Check if the currentPersona exists in the channel's personas.
    const getCurrentPersona = readDataBy('id', channelID).currentPersona;
    const currentPersona = personaName ? personaName : getCurrentPersona;

    if (!personaList.hasOwnProperty(currentPersona)) {
        if (!personaList.hasOwnProperty(updatePName)) {
            console.log(`Existing persona: ${currentPersona} does not exist in the database. Reverting to default.\n`);
            return updateData(channelID, 'currentPersona', 'Default');
        };
        console.log(`Existing persona: ${currentPersona} does not exist in the database. Updating to ${updatePName}.\n`);
        return updateData(channelID, 'currentPersona', updatePName);
    };
};

// INSERT new data into database. (before insertion, channelId should ALWAYS be parsed toString when using function for accurate storing)
function insertNewData(channelID, isEnabled) {
    // Checks if channel ID exists in db
    if (!channelExists(channelID)) {
        insertStatement.run(channelID, isEnabled, JSON.stringify(defaultData.personas), 'Default', chatModel['GPT-4 Turbo'], imageModel['Dall·E 3']);
        return console.log(`\nNew data added for channel ID: ${channelID}.\n`);
    } else {        
        return console.log(`\nChannel ID: ${channelID} already exists in the database.\n`);
    }
};

// READ all from the database.
function readAllFromTable() {
    const readStatement = db.prepare('SELECT * FROM botStatus').all();
    if (tableExists('botStatus')) {
        if ((readStatement === nullVar) || readStatement.length === 0) { // if table exists, check if it has any data
            console.log('ERROR: unable to fetch any records as the table is empty.\n');
            return;
        };
    }; // else returns undefined
    
    return readStatement.map(row => ({
        channelID: row.channelID,
        isEnabled: row.isEnabled,
        personas: JSON.parse(row.personas),
        currentPersona: row.currentPersona,
        currentChatModel: row.currentChatModel,
        currentImageModel: row.currentImageModel
    }));
};

// READ data based on search input.
function readDataBy(searchBy, input) {
    // Return data format for reusability for single data retrieval.
    let returnStatement = function(returnData) {
        if (!tableExists('botStatus')) return; // first check for table existence
        
        if (returnData == undefined) { // then check if data row exists
            console.log('ERROR: no results found from the queried search, data does not exist.\n');
            return;
        } else {
            return {
                channelID: returnData.channelID,
                isEnabled: returnData.isEnabled,
                personas: JSON.parse(returnData.personas),
                currentPersona: returnData.currentPersona,
                currentChatModel: returnData.currentChatModel,
                currentImageModel: returnData.currentImageModel
            };
        };
    };

    try {
        if (searchBy === 'id' && channelExists(input)) {
            const selectById = db.prepare('SELECT * FROM botStatus WHERE channelID = ?').get(input);
            return returnStatement(selectById);
        } else if (searchBy === 'row') {
            let rowNum = input - 1;
            const selectByRow = db.prepare('SELECT * FROM botStatus LIMIT 1 OFFSET ?').get(rowNum);
            return returnStatement(selectByRow);
        } else return returnStatement();
    } catch (error) {
        console.error(`ERROR in reading queried data from database:\n`, error);
    };
};

// READ specific persona key value pair.
function readPersona(channelID, personaName) {
    try {
        if (!tableExists('botStatus')) return;
        if (!channelExists(channelID)) return console.log('ERROR: channel ID does not exist.\n');

        const selectStatement = db.prepare('SELECT personas FROM botStatus WHERE channelID = ?').get(channelID);
        const personaList = JSON.parse(selectStatement.personas);
        if (personaName == nullVar) {
            return personaList;
        } else {
            if (personaList.hasOwnProperty(personaName)) {
                return personaList[personaName];
            } else {
                return console.log(`Persona: '${personaName}' does not exists in the database: Unable to fetch\n`);
            };
        };
    } catch (error) {
        console.error(`ERROR in reading queried persona from database:\n`, error);
    }
};

// UPDATE data (isEnabled etc. does not include personas) based on channelID.
function updateData(channelID, column, input) {
    try {
        if (!tableExists('botStatus')) return;
        if (channelExists(channelID) && columnExists(column)) {
            const updateStatement = db.prepare(`UPDATE botStatus SET ${column} = ? WHERE channelID = ?`);
            if (checkColumn(column, input)) {
                updateStatement.run(input, channelID);
                return console.log(`Column \'${column}\' at channel ID: ${channelID} has been updated to '${input}' successfully.\n`);                
            };
        } else {
            return console.log(`ERROR in updating the data specified.\n`);
        };
    } catch (error) {
        console.error(`ERROR in updating the queried data from database:\n`, error);
    };
};

// DELETE data from table.
function deleteData(searchBy, input) {
    try {
        if (readAllFromTable() != null) {
            const channelData = readDataBy(searchBy, input);
    
            if (typeof channelData === 'object' && channelData != undefined) { // checks if the returned value is an object or not
                const deleteStatement = db.prepare('DELETE FROM botStatus WHERE channelID = ?');
                deleteStatement.run(channelData.channelID); // delete data by referencing the ID from the returned object
                return console.log(`Data for channel ID: ${channelData.channelID} has been successfully deleted.\n`);
            } else if (channelData === undefined && input == 'all') {
                const deleteAllStatement = db.prepare('DELETE FROM botStatus');
                deleteAllStatement.run();
                return console.log(`Data for table: botStatus has been successfully deleted.\n`);
            } else {
                return console.log(`ERROR: No data found for the specified search (${searchBy}: ${input}).\n`);
            };
        } else {            
            return console.log(`The table botStatus is empty. No data to delete.\n`);
        }
    } catch (error) {
        console.error(`ERROR in deleting data from database:\n`, error);
    };    
};

// EDIT persona name and description through insertion, modification, and deletion.
function editPersona(action, channelID, personaName, description, updatePName, updateDes) {
    try {
        if (!tableExists('botStatus')) return;
        if (!channelExists(channelID)) return console.log('ERROR: channel ID does not exist.\n');

        // Fetch existing personas from the database
        const selectStatement = db.prepare('SELECT personas FROM botStatus WHERE channelID = ?').get(channelID);
        const personaList = JSON.parse(selectStatement.personas);

        // Check action and if the persona name already exists
        if (action == 'insert') {
            if (!personaList.hasOwnProperty(personaName)) {
                // Check if the description already exists
                for (const existingPersonaDescription of Object.values(personaList)) {
                    if (existingPersonaDescription === description) {
                        return `The description: '${description}'\nAlready exists for another persona.\n`;
                    }
                }                
                // Append new key-value pair to object
                personaList[personaName] = description;
            } else {
                return `Persona: '${personaName}' already exists in the database.\n`;
            };
        };
        if (action == 'update') {
            if (personaList.hasOwnProperty(personaName)) {
                // Checking constants.
                const checkDescDiff = personaList[personaName] != updateDes;
                if (personaName === 'Default') return 'Default persona cannot be edited.\n';
                if (personaList.hasOwnProperty(updatePName) && updatePName !== personaName) return 'Persona name to be updated already exists in the database.\n';

                // Checks and updates persona name, then description.
                if ((updatePName !== nullVar) && personaName !== updatePName) {
                    // Assign new key.
                    personaList[updatePName] = personaList[personaName]; 

                    // Updates description as well if parameter is provided.
                    if ((updateDes !== nullVar) && checkDescDiff) {
                        personaList[updatePName] = updateDes;
                    };
                
                    // Delete old key.
                    delete personaList[personaName];
                } else if ((updateDes !== nullVar) && checkDescDiff) {
                    personaList[personaName] = updateDes;
                } else {
                    return `Persona: '${personaName}' was not edited as there aren't any new changes.\n`;
                }
            } else {
                return `Persona: '${personaName}' does not exists in the database: Unable to update.\n`;
            };
        };
        if (action == 'delete') {
            if (personaList.hasOwnProperty(personaName)) {
                // Ensure that user does not delete channel default persona.
                if (personaName === 'Default') {
                    return 'Default persona cannot be deleted.\n';
                }
                
                // Delete selected key-value pair
                delete personaList[personaName];
            } else {
                return `Persona: '${personaName}' does not exists in the database.\n`;
            };
        };

        // Convert JSON object to string to update it in the table
        const updatedPersonasJson = JSON.stringify(personaList);

        // Update the row with the updated personas object
        const updateStatement = db.prepare('UPDATE botStatus SET personas = ? WHERE channelID = ?');
        updateStatement.run(updatedPersonasJson, channelID);
        
        if (action == 'insert') {
            console.log(`New persona: '${personaName}' has been successfully INSERTED to the row at channel ID: ${channelID}.\n`);
            return true;
        } else if (action == 'update') {
            console.log(`Persona: '${personaName}' has been successfully UPDATED at row of channel ID: ${channelID}.\n`);
            checkCurrentPersona(channelID, personaName, updatePName);
            return true;
        } else if (action == 'delete') {
            console.log(`Persona: '${personaName}' has been successfully DELETED at row of channel ID: ${channelID}.\n`);
            checkCurrentPersona(channelID);
            return true;
        };
    } catch (error) {
        console.error(`Error editing persona:\n`, error);
    };
};

// DROP table.
function dropTable(tableName) {
    if (!tableExists(tableName)) return;
    
    const dropStatement = db.prepare(`DROP TABLE ${tableName}`);
    dropStatement.run();
    return console.log(`The '${tableName}' table has been dropped from the database.`);
};

// Close the database connection when the bot shuts down (optional but recommended).
process.on('exit', () => {
  db.close();
  console.log('\nDatabase connection closed.\n');
});

// Export the database object for use in other parts of your code.
module.exports = {
    db,
    insertNewData,
    readAllFromTable,
    readDataBy,
    readPersona,
    updateData,
    deleteData,
    editPersona,
    dropTable,
    checkColumn,
    channelExists,
    checkCurrentPersona,
    restoreDefaultPersonas
};