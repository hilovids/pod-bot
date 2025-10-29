const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv').config();
const { Client, Collection, GatewayIntentBits, MessageFlags } = require('discord.js');


const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMessageReactions] });
client.commands = new Collection();

// Archipelago persistent manager
const archipelago = require('./utility/archipelago');

// Function to recursively find all .js files in a directory
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
if (!fs.existsSync(foldersPath)) {
    console.warn(`[WARNING] Commands directory not found: ${foldersPath}`);
} 
else {
    const commandFiles = getJsFiles(foldersPath);
    for (const filePath of commandFiles) {
        const command = require(filePath);
        if (command.data && command.execute) {
            client.commands.set(command.data.name, command);
        } else {
            console.warn(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
        }
    }
}

// Load Events
const eventsPath = path.join(__dirname, 'events');
if (!fs.existsSync(eventsPath)) {
    console.warn(`[WARNING] Events directory not found: ${eventsPath}`);
} 
else {
    const eventFiles = getJsFiles(eventsPath);
    for (const filePath of eventFiles) {
        const event = require(filePath);
        if (event.once) {
            client.once(event.name, (...args) => event.execute(...args));
        } else {
            client.on(event.name, (...args) => event.execute(...args));
        }
    }
}

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    const command = client.commands.get(interaction.commandName);

    // Log command details
    console.log(`🔹 Command Received: /${interaction.commandName}`);
    console.log(`   👤 User: ${interaction.user.username} (${interaction.user.id})`);
    if (interaction.guild) {
        console.log(`   🏠 Guild: ${interaction.guild.name} (${interaction.guild.id})`);
    } else {
        console.log(`   📬 DM Interaction`);
    }

    if (!command) {
        console.log(`⚠️ Command not found: /${interaction.commandName}`);
        return;
    }

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(`❌ Error executing /${interaction.commandName}:`, error);
        await interaction.reply({ content: "An error occurred while executing this command.", flags: MessageFlags.Ephemeral });
    }
});



client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    // Load persistent Archipelago rooms
    await archipelago.loadArchipelagoRooms(client);
});

client.login(process.env.DISCORD_TOKEN);