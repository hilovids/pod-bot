const { REST, Routes } = require('discord.js');
const dotenv = require('dotenv').config();
const fs = require('fs');
const path = require('path');

const isDev = process.env.NODE_ENV === 'development';

const commands = [];
const clientId = process.env.DISCORD_CLIENTID;
const token = process.env.DISCORD_TOKEN;
const guildId = process.env.DISCORD_GUILDID; // Used only in development mode

// Function to recursively get all command files
function getJsFiles(dir) {
    let files = [];
    if (!fs.existsSync(dir)) {
        console.warn(`[WARNING] Directory not found: ${dir}`);
        return files;
    }
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files = files.concat(getJsFiles(fullPath));
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
            files.push(fullPath);
        }
    });
    return files;
}

// Load Commands
const foldersPath = path.join(__dirname, 'commands');
const commandFiles = getJsFiles(foldersPath);

for (const filePath of commandFiles) {
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        commands.push(command.data.toJSON());
    } else {
        console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
    }
}

// Construct and prepare an instance of the REST module
const rest = new REST().setToken(token);

// Determine command registration scope
const route = isDev && guildId
    ? Routes.applicationGuildCommands(clientId, guildId) // Fast updates in development
    : Routes.applicationCommands(clientId); // Global registration

// Deploy commands
(async () => {
    try {
        console.log(`Started refreshing ${commands.length} application (/) commands.`);

        // Deploy commands
        const data = await rest.put(route, { body: commands });

        console.log(`Successfully reloaded ${data.length} application (/) commands.`);
    } catch (error) {
        console.error(error);
    }
})();
