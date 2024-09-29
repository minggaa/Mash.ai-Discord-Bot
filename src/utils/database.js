// Importing necessary classes and files.
const Database = require('better-sqlite3');

const config = require('../../botConfig.json');
const models = config.GenerationModels;
const schemaFields = config.ReplicateSchemaField;

const chatModel = models.ChatModels;
const imageModel = models.ImageModels;

const defaultChatModel = chatModel['GPT-4o'];
const defaultImageModel = imageModel['Stable Diffusion'];
const defaultScheduler = schemaFields.scheduler[0];
const defaultRefiner = schemaFields.refiner[0];

// Table names.
const tbAppStatus = 'appStatus';
const tbUsers = 'users';

// Connect to the database.
const db = new Database('mash.db');

// Prepare database table.
db.prepare(`
    CREATE TABLE IF NOT EXISTS ${tbAppStatus} (
        channelID VARCHAR(255) NOT NULL PRIMARY KEY,
        isEnabled BOOLEAN DEFAULT 0 NOT NULL,
        personas TEXT NOT NULL,
        currentPersona VARCHAR(255) DEFAULT 'Default' NOT NULL,
        currentChatModel VARCHAR(255) DEFAULT '${defaultChatModel}' NOT NULL,
        currentImageModel VARCHAR(255) DEFAULT '${defaultImageModel}' NOT NULL,
        formSettings TEXT NOT NULL
    )
`).run();

db.prepare(`
    CREATE TABLE IF NOT EXISTS ${tbUsers} (
        userID VARCHAR(255) NOT NULL PRIMARY KEY,
        tokensUsed VARCHAR(255) NOT NULL
    )
`).run();

const defaultData = {
    personas: {
        "Default": "Mash is a helpful and friendly assistant.",
        "Salesperson": "You are a friendly salesperson.",
        "Support": "A knowledgeable and supportive agent, with every reply you will end the sentence with howdy!."
    },
    formSettings: {
        "scheduler": defaultScheduler,
        "refiner": defaultRefiner
    }
};
const nullVar = undefined || null;

const toTitleCase = (input) => {
    return input.charAt(0).toUpperCase() + input.slice(1);
};

// Writing JSON to the database.
const insertStatement = (table) => {
    switch (table) {
        case tbAppStatus:
            return db.prepare(`INSERT OR IGNORE INTO ${tbAppStatus} (channelID, isEnabled, personas, currentPersona, currentChatModel, currentImageModel, formSettings) VALUES (?, ?, ?, ?, ?, ?, ?)`);
        case tbUsers:
            return db.prepare(`INSERT OR IGNORE INTO ${tbUsers} (userID, tokensUsed) VALUES (?, ?)`);
    }
};

function restoreDefault(table, column, id) {
    try {
        let idType;
        switch (table) {
            case tbAppStatus:
                idType = 'channelID';
                break;
            case tbUsers:
                idType = 'userID';
                break;
        };

        const updateStatement = db.prepare(`UPDATE ${table} SET ${column} = ? WHERE ${idType} = ?`);

        if (column === 'personas') updateStatement.run(JSON.stringify(defaultData.personas), id);
        if (column === 'formSettings') updateStatement.run(JSON.stringify(defaultData.formSettings), id);

        return console.log(`${toTitleCase(column)} for ${idType}: ${id} has been successfully restored to default.\n`);
    } catch (error) {
        return console.error(`ERROR: ${error}\n`);
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
    const checkStatement = db.prepare(`SELECT * FROM ${tbAppStatus} WHERE channelID = ? AND channelID IS NOT NULL`).get(channelID);
    return !!checkStatement; // returns true or false
};

// CHECK if userID exists in the db.
function userExists(userID) {
    const checkStatement = db.prepare(`SELECT * FROM ${tbUsers} WHERE userID = ? AND userID IS NOT NULL`).get(userID);
    return !!checkStatement; // returns true or false
};

// CHECK if column exists in the db
function columnExists(table, column) {
    const query = db.prepare(`PRAGMA table_info(${table});`); // queries to get information on table, including columns
    const columns = query.all(); // gets all columns in array of objects
    for (const col of columns) {
        if (col.name === column) {
            return true;
        }
    };
    console.log(`ERROR: unable to fetch any records as the column (${column}) does not exist.\n`);
    return false;
};

// CHECK for data validity of specified column.
function checkColumn(table, column, input) {
    const checkStatement = db.prepare(`SELECT ${column} FROM ${table}`);
    const columnType = checkStatement.columns().map(column => column.type.toLowerCase()); // extracts the data type of the input column
    let inputType;
    
    if ((typeof input == 'integer' || 'number') && (input === 0 || input === 1)) {
        inputType = 'boolean';
    } else if (typeof input == 'number') {
        inputType = 'integer';
    } else if (typeof input == 'string') {
        inputType = 'varchar(255)';
    }

    // console.log(`${typeof input}\n${columnType}\ninput type: ${inputType}\ncolumn type: ${columnType}`);
    if (inputType != columnType) {
        console.log(`\n${columnType}\n${inputType}\n`);
        console.log(`ERROR in updating the specified data due to a mismatch of data types in the table column.\n`);
        return false;
    } else {
        return true;
    }
};

// Check for the existence currentPersona.
function checkCurrentPersona(column, channelID, personaName, updatePName) {
    if (column === 'formSettings') return;

    const selectStatement = db.prepare(`SELECT ${column} FROM ${tbAppStatus} WHERE channelID = ?`).get(channelID);
    const jsonData = JSON.parse(selectStatement.personas);
    
    if (column === 'personas') {
        // Check if the currentPersona exists in the channel's personas.
        const getCurrentPersona = readDataBy(tbAppStatus, 'id', channelID).currentPersona;
        const currentPersona = personaName ? personaName : getCurrentPersona;

        if (!jsonData.hasOwnProperty(currentPersona)) {
            if (!jsonData.hasOwnProperty(updatePName)) {
                console.log(`Existing persona: ${currentPersona} does not exist in the database. Reverting to default.\n`);
                return updateData(tbAppStatus, channelID, 'currentPersona', 'Default');
            };
            console.log(`Existing persona: ${currentPersona} does not exist in the database. Updating to ${updatePName}.\n`);
            return updateData(tbAppStatus, channelID, 'currentPersona', updatePName);
        };
    };
};

// INSERT new data into database. (before insertion, id should ALWAYS be parsed toString when using function for accurate storing)
function insertNewData(table, id, isEnabled) {
    if (!tableExists(table)) return;

    switch (table) {
        case tbAppStatus:
            if (!channelExists(id)) {
                insertStatement(tbAppStatus).run(id, isEnabled, JSON.stringify(defaultData.personas), 'Default', defaultChatModel, defaultImageModel, JSON.stringify(defaultData.formSettings));
                return console.log(`\nNew data added for channel ID: ${id}.\n`);
            } else {        
                return console.log(`\nChannel ID: ${id} already exists in the database.\n`);
            };
        case tbUsers:
            if (!userExists(id)) {
                insertStatement(tbUsers).run(id, '0');
                return console.log(`\nNew data added for user ID: ${id}.\n`);
            } else {
                return console.log(`\nUser ID: ${id} already exists in the database.\n`);
            };
    };
};

// READ all from the database.
function readAllFromTable(table) {
    const readStatement = db.prepare(`SELECT * FROM ${table}`).all();
    if (tableExists(table)) {
        if ((readStatement === nullVar) || readStatement.length === 0) { // if table exists, check if it has any data
            console.log('ERROR: unable to fetch any records as the table is empty.\n');
            return;
        };
    };
    
    switch (table) {
        case tbAppStatus:
            return readStatement.map(row => ({
                channelID: row.channelID,
                isEnabled: row.isEnabled,
                personas: JSON.parse(row.personas),
                currentPersona: row.currentPersona,
                currentChatModel: row.currentChatModel,
                currentImageModel: row.currentImageModel,
                formSettings: JSON.parse(row.formSettings)
            }));
        case tbUsers:
            return readStatement.map(row => ({
                userID: row.userID,
                tokensUsed: row.tokensUsed
            }));
    };
};

// READ data based on search input.
function readDataBy(table, searchBy, input) {
    // Return data format for reusability for single data retrieval.
    const returnStatement = (returnData) => {
        if (!tableExists(table)) return; // first check for table existence
        
        if (!returnData) { // then check if data row exists
            console.log('ERROR: no results found from the queried search, data does not exist.\n');
            return;
        } else {
            switch (table) {
                case tbAppStatus:
                    return {
                        channelID: returnData.channelID,
                        isEnabled: returnData.isEnabled,
                        personas: JSON.parse(returnData.personas),
                        currentPersona: returnData.currentPersona,
                        currentChatModel: returnData.currentChatModel,
                        currentImageModel: returnData.currentImageModel,
                        formSettings: JSON.parse(returnData.formSettings)
                    };
                case tbUsers:
                    return {
                        userID: returnData.userID,
                        tokensUsed: returnData.tokensUsed
                    };
            };
        };
    };

    try {
        if (searchBy === 'id') {
            const idName = table === tbAppStatus ? 'channelID' : 'userID';
            const selectById = db.prepare(`SELECT * FROM ${table} WHERE ${idName} = ?`).get(input);
            return returnStatement(selectById);
        } else if (searchBy === 'row') {
            let rowNum = input - 1;
            const selectByRow = db.prepare(`SELECT * FROM ${table} LIMIT 1 OFFSET ?`).get(rowNum);
            return returnStatement(selectByRow);
        } else return returnStatement();
    } catch (error) {
        console.error(`ERROR in reading queried data from database:\n`, error);
    };
};

// READ specific persona key value pair.
function readJSONData(column, channelID, property) {
    try {
        if (!tableExists(tbAppStatus)) return;
        if (!channelExists(channelID)) return console.log('ERROR: channel ID does not exist.\n');
        if (!columnExists(tbAppStatus, column)) return console.log('ERROR: column does not exist.\n');

        const selectStatement = db.prepare(`SELECT ${column} FROM ${tbAppStatus} WHERE channelID = ?`).get(channelID);
        const jsonData = JSON.parse(selectStatement[column]);
        if (property == nullVar) {
            return jsonData;
        } else {
            if (jsonData.hasOwnProperty(property)) {
                return jsonData[property];
            } else {
                const colName = toTitleCase(column);
                return console.log(`${colName}: '${property}' does not exists in the database - Unable to fetch\n`);
            };
        };
    } catch (error) {
        console.error(`ERROR in reading queried ${column} from database:\n`, error);
    }
};

// UPDATE data (isEnabled etc. does not include personas) based on id.
function updateData(table, id, column, input) {
    try {
        if (!tableExists(table)) return;

        let idType, isExist;
        switch (table) {
            case tbAppStatus:
                idType = 'channelID';
                isExist = channelExists(id);
                break;
            case tbUsers:
                idType = 'userID';
                isExist = userExists(id);
                break;
        };

        if (isExist && columnExists(table, column)) {
            const updateStatement = db.prepare(`UPDATE ${table} SET ${column} = ? WHERE ${idType} = ?`);
            if (checkColumn(table, column, input)) {
                updateStatement.run(input, id);
                return console.log(`Table (${table}) > Column (${column}) at ${idType}: ${id} has been updated to '${input}' successfully.\n`);                
            };
        } else {
            return console.log(`ERROR in updating the data specified.\n`);
        };
    } catch (error) {
        console.error(`ERROR in updating the queried data from database:\n`, error);
    };
};

// DELETE data from table.
function deleteData(table, searchBy, input) {
    try {
        if (readAllFromTable(table) != null) {
            const getData = readDataBy(table, searchBy, input);
    
            if (typeof getData === 'object' && getData != undefined) { // checks if the returned value is an object or not
                let id, idType;
                switch (table) {
                    case tbAppStatus:
                        id = getData.channelID;
                        idType = 'channelID';
                        break;
                    case tbUsers:
                        id = getData.userID;
                        idType = 'userID';
                        break;
                };

                const deleteStatement = db.prepare(`DELETE FROM ${table} WHERE ${idType} = ?`);
                deleteStatement.run(id); // delete data by referencing the ID from the returned object
                return console.log(`Data for channel ID: ${id} has been successfully deleted.\n`);
            } else if (getData === undefined && input == 'all') {
                const deleteAllStatement = db.prepare(`DELETE FROM ${table}`);
                deleteAllStatement.run();
                return console.log(`Data for table: ${table} has been successfully deleted.\n`);
            } else {
                return console.log(`ERROR: No data found for the specified search (${searchBy}: ${input}).\n`);
            };
        } else {            
            return console.log(`The table ${table} is empty. No data to delete.\n`);
        }
    } catch (error) {
        console.error(`ERROR in deleting data from database:\n`, error);
    };    
};

// EDIT JSON key and value through insertion, modification, and deletion.
function editJSONData(column, action, channelID, key, value, updateKey, updateValue) {
    try {
        if (!tableExists(tbAppStatus)) return;
        if (!channelExists(channelID)) return console.log('ERROR: channel ID does not exist.\n');
        if (!columnExists(tbAppStatus, column)) return console.log('ERROR: column does not exist.\n');

        const selectStatement = db.prepare(`SELECT ${column} FROM ${tbAppStatus} WHERE channelID = ?`).get(channelID);
        const jsonData = JSON.parse(selectStatement[column]);

        // Check action and if the key already exists
        if (action == 'insert') {
            if (!jsonData.hasOwnProperty(key)) {
                // Check if the value already exists
                for (const existingValue of Object.values(jsonData)) {
                    if (existingValue === value) {
                        return `The value: '${value}'\nAlready exists for another key/property.\n`;
                    }
                }                
                // Append new key-value pair to object
                jsonData[key] = value;
            } else {
                return `${toTitleCase(column)}: '${key}' already exists in the database.\n`;
            };
        };
        if (action == 'update') {
            if (jsonData.hasOwnProperty(key)) {
                // Checking constants.
                const checkValueDiff = jsonData[key] != updateValue;
                if (column === 'personas' && key === 'Default') return 'Default persona cannot be edited.\n';
                if (column === 'formSettings' && !schemaFields[key].includes(value)) return `Value entered for ${key} is not a valid option: ${value}`; // check if value entred exists in key's field options
                if (jsonData.hasOwnProperty(updateKey) && updateKey !== key) return `${toTitleCase(column)} name to be updated already exists in the database.\n`;

                // Checks and updates key, then value.
                if ((updateKey !== nullVar) && key !== updateKey) {
                    // Assign new key.
                    jsonData[updateKey] = jsonData[key]; 

                    // Updates value as well if parameter is provided.
                    if ((updateValue !== nullVar) && checkValueDiff) {
                        jsonData[updateKey] = updateValue;
                    };
                
                    // Delete old key.
                    delete jsonData[key];
                } else if ((updateValue !== nullVar) && checkValueDiff) {
                    jsonData[key] = updateValue;
                } else {
                    return `${toTitleCase(column)}: '${key}' was not edited as there aren't any new changes.\n`;
                }
            } else {
                return `${toTitleCase(column)}: '${key}' does not exists in the database - Unable to update.\n`;
            };
        };
        if (action == 'delete') {
            if (jsonData.hasOwnProperty(key)) {
                // Ensure that user does not delete channel default persona or properties in formSettings.
                if (column === 'personas' && key === 'Default') return 'Default persona cannot be deleted.\n';
                if (column === 'formSettings') return 'Properties in formSettings cannot be deleted.\n';
                
                // Delete selected key-value pair
                delete jsonData[key];
            } else {
                return `${toTitleCase(column)}: '${key}' does not exists in the database.\n`;
            };
        };

        // Convert JSON object to string to update it in the table
        const updatedJSONData = JSON.stringify(jsonData);

        // Update the row with the updated personas object
        const updateStatement = db.prepare(`UPDATE ${tbAppStatus} SET ${column} = ? WHERE channelID = ?`);
        updateStatement.run(updatedJSONData, channelID);
        
        if (action == 'insert') {
            console.log(`New ${toTitleCase(column)}: '${key}' has been successfully INSERTED to the row at channel ID: ${channelID}.\n`);
            return true;
        } else if (action == 'update') {
            console.log(`${toTitleCase(column)}: '${key}' has been successfully UPDATED at row of channel ID: ${channelID}.\n`);
            checkCurrentPersona(column, channelID, key, updateKey);
            return true;
        } else if (action == 'delete') {
            console.log(`${toTitleCase(column)}: '${key}' has been successfully DELETED at row of channel ID: ${channelID}.\n`);
            checkCurrentPersona(column, channelID);
            return true;
        };
    } catch (error) {
        console.error(`Error editing ${toTitleCase(column)}:\n`, error);
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
    readJSONData,
    updateData,
    deleteData,
    editJSONData,
    dropTable,
    checkColumn,
    channelExists,
    checkCurrentPersona,
    restoreDefault
};