
const { Client } = require('archipelago.js');
const db = require('../utility/db');

// In-memory map: gameId -> { client, channelId }
const archipelagoGames = new Map();

async function loadArchipelagoRooms(discordClient) {
    // Load all registered rooms from DB
    const rows = await db.query('SELECT * FROM archipelago_rooms');
    for (const row of rows) {
        connectArchipelagoRoom(row.game_id, row.channel_id, discordClient);
    }
}

function connectArchipelagoRoom(port, slotName) {
    if (archipelagoGames.has(slotName)) return; // Already connected
    const apClient = new Client();

    // Listen for plain-text messages from Archipelago
    apClient.messages.on('message', (content) => {
        const channel = discordClient.channels.cache.get(channelId);
        if (channel) channel.send({ content: `Archipelago connection error: ${err.message}` });
        console.log(`[AP][${port}] ${content}`);
    });

    // Login to the server (TextOnly mode)
    apClient.login(`archipelago.gg:${port}`, slotName)
        .then(() => {
            console.log(`[AP] Botsquatch connected to Archipelago server as [${slotName}]`);
        })
        .catch((err) => {
            const channel = discordClient.channels.cache.get(channelId);
            if (channel) channel.send({ content: `Archipelago connection error: ${err.message}` });
            console.error(`[AP] Archipelago connection error for game ${slotName}:`, err);
        });

    archipelagoGames.set(slotName, { client: apClient, port });
}

module.exports = { loadArchipelagoRooms, connectArchipelagoRoom, archipelagoGames };