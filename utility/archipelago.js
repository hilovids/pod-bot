let Client;
(async () => {
  ({ Client } = await import('archipelago.js'));
})();

const db = require('../utility/db');

// In-memory map: gameId -> { client, channelId }
const archipelagoGames = new Map();

// Helper to always get a text channel, even if not cached
async function getTextChannel(discordClient, channelId) {
    let channel = discordClient.channels.cache.get(channelId);
    if (!channel) {
        try {
            channel = await discordClient.channels.fetch(channelId);
        } catch (e) {
            console.error(`Could not fetch channel ${channelId}:`, e);
            return null;
        }
    }
    return channel;
}

async function loadArchipelagoRooms(discordClient) {
    // Load all registered rooms from DB
    const rows = await db.query('SELECT * FROM archipelago_rooms');
    for (const row of rows) {
        // Use port_id, channel_id, slot_name from DB
        connectArchipelagoRoom(row.port_id, row.channel_id, row.slot_name, discordClient);
    }
}

async function connectArchipelagoRoom(port, channelId, slotName, discordClient) {
    if (archipelagoGames.has(slotName)) return; // Already connected
    const apClient = new Client();
    console.log(`[AP] Connecting to Archipelago server on port ${port} as slot [${slotName}]`);
    // Listen for item/hint events
    apClient.items.on('itemsReceived', async (items) => {
        const channel = await getTextChannel(discordClient, channelId);
        if (!channel) return;
        for (const item of items) {
            const embed = {
                title: 'Item Received',
                description: `**Item:** ${item.itemName || item.item || 'Unknown'}\n**From:** ${item.fromPlayerName || item.fromPlayer || 'Unknown'}\n**Index:** ${item.index || ''}`,
                color: 0x00ff00,
                timestamp: new Date().toISOString(),
            };
            channel.send({ embeds: [embed] });
        }
    });

    apClient.items.on('hintReceived', async (hint) => {
        const channel = await getTextChannel(discordClient, channelId);
        if (!channel) return;
        const embed = {
            title: 'Hint Received',
            description: `**Hint:** ${hint.hint || JSON.stringify(hint)}`,
            color: 0x0099ff,
            timestamp: new Date().toISOString(),
        };
        channel.send({ embeds: [embed] });
    });

    apClient.items.on('hintFound', async (hint) => {
        const channel = await getTextChannel(discordClient, channelId);
        if (!channel) return;
        const embed = {
            title: 'Hint Found',
            description: `**Hint:** ${hint.hint || JSON.stringify(hint)}`,
            color: 0x0099ff,
            timestamp: new Date().toISOString(),
        };
        channel.send({ embeds: [embed] });
    });

    // Listen for deathLink events
    apClient.deathLink.on('deathReceived', async (death) => {
        const channel = await getTextChannel(discordClient, channelId);
        if (!channel) return;
        const embed = {
            title: 'DeathLink Triggered',
            description: `**Source:** ${death.source || 'Unknown'}\n**Cause:** ${death.cause || 'Unknown'}\n**Time:** ${death.time ? new Date(death.time * 1000).toLocaleString() : 'Unknown'}`,
            color: 0xff0000,
            timestamp: new Date().toISOString(),
        };
        channel.send({ embeds: [embed] });
    });

    // Login to the server
    apClient.login(`archipelago.gg:${port}`, slotName)
        .then(async () => {
            const channel = await getTextChannel(discordClient, channelId);
            if (channel) channel.send({ content: `Connected to Archipelago server as [${slotName}] on port ${port}` });
            console.log(`[AP] Botsquatch connected to Archipelago server as [${slotName}] on port ${port}`);
        })
        .catch(async (err) => {
            const channel = await getTextChannel(discordClient, channelId);
            if (channel) channel.send({ content: `Archipelago connection error: ${err.message}` });
            console.error(`[AP] Archipelago connection error for slot [${slotName}] on port ${port}:`, err);
        });

    archipelagoGames.set(slotName, { client: apClient, port, channelId });
}

async function getTextChannel(discordClient, channelId) {
    let channel = discordClient.channels.cache.get(channelId);
    if (!channel) {
        try {
            channel = await discordClient.channels.fetch(channelId);
        } catch (e) {
            console.error(`Could not fetch channel ${channelId}:`, e);
            return null;
        }
    }
    return channel;
}

module.exports = { loadArchipelagoRooms, connectArchipelagoRoom, archipelagoGames };