if (typeof global.WebSocket === 'undefined') {
  global.WebSocket = require('ws');
}

if (typeof global.navigator === 'undefined') {
  global.navigator = { userAgent: 'node.js' };
}

// Helper to get player count for a given port and slot
async function getPlayerCount(port, slotName) {
    if (!Client) {
        ({ Client } = await import('archipelago.js'));
    }
    const apClient = new Client();
    try {
        await apClient.login(`archipelago.gg:${port}`, slotName);
        // slots is a getter, so access as property
        const slots = apClient.players.slots;
        return slots ? Object.keys(slots).length : 0;
    } catch (e) {
        console.error(`[AP] Could not get player count for port ${port}, slot ${slotName}:`, e);
        return 0;
    } finally {
        apClient.disconnect && apClient.disconnect();
    }
}
let Client;
(async () => {
    ({ Client } = await import('archipelago.js'));
})();

const db = require('../utility/db');

// In-memory map: gameId -> { client, channelId }
const archipelagoGames = new Map();

// Listen for goal events and update DB
async function handleGoalAchieved(channelId, slotName, discordClient, released = false) {
    // Increment finished_count for this room
    await db.query('UPDATE archipelago_rooms SET finished_count = finished_count + 1 WHERE channel_id = ?', [channelId]);
    // Get updated counts
    const rows = await db.query('SELECT * FROM archipelago_rooms WHERE channel_id = ?', [channelId]);
    if (!rows.length) return;
    const { player_count, finished_count } = rows[0];
    const remaining = Math.max(0, (player_count || 0) - (finished_count || 0));
    const channel = await getTextChannel(discordClient, channelId);
    if (channel) {
        channel.send({
            embeds: [{
                title: released ? 'Game Released' : 'Goal Achieved!',
                description: `${slotName} has ${released ? 'released' : 'finished'} their game!\n${remaining} player(s) still need to finish.`,
                color: released ? 0x260c9bff : 0xFFD700,
                timestamp: new Date().toISOString(),
            }]
        });
    }
    // If all players finished, archive channel and DB entry
    if (player_count && finished_count && finished_count >= player_count) {
        // Move channel to archive category
        const archiveCategoryId = process.env.AP_ARCHIVE_CATEGORY_ID;
        if (channel && archiveCategoryId) {
            try {
                await channel.setParent(archiveCategoryId);
            } catch (e) {
                console.error('Failed to move channel to archive category:', e);
            }
        }
        // Move DB entry to archive table
        await db.query('INSERT INTO archipelago_rooms_archive SELECT * FROM archipelago_rooms WHERE channel_id = ?', [channelId]);
        await db.query('DELETE FROM archipelago_rooms WHERE channel_id = ?', [channelId]);
        // Remove listeners and client
        for (const [slot, obj] of archipelagoGames.entries()) {
            if (obj.channelId === channelId) {
                if (obj.client && obj.client.removeAllListeners) obj.client.removeAllListeners();
                if (obj.client && obj.client.disconnect) obj.client.disconnect();
                archipelagoGames.delete(slot);
            }
        }
        if (channel) {
            channel.send({ content: 'All players have finished! This channel has been archived.' });
        }
    }
}

// Helper to always get a text channel, even if not cached
async function getTextChannel(discordClient, channelId) {
    let channel = discordClient.channels.cache.get(channelId);
    if (!channel) {
        try {
            channel = await discordClient.channels.fetch(channelId);
        } catch (e) {
            console.error(`[AP] Could not fetch channel ${channelId}:`, e);
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
    // Flood prevention for itemsReceived
        let ignoreItemsUntil = Date.now() + 10000; // Ignore itemsReceived for 10 seconds after connect
        let itemFloodBuffer = [];
        let itemFloodTimeout = null;
        apClient.items.on('itemsReceived', async (items) => {
            if (Date.now() < ignoreItemsUntil) return; // Ignore during initial window
            console.log(items);
            itemFloodBuffer.push(...items);
            if (itemFloodTimeout) {
                clearTimeout(itemFloodTimeout);
            }
            itemFloodTimeout = setTimeout(async () => {
                const channel = await getTextChannel(discordClient, channelId);
                if (!channel) {
                    itemFloodBuffer = [];
                    itemFloodTimeout = null;
                    return;
                }
                if (itemFloodBuffer.length > 10) {
                    const embed = {
                        title: 'Many Items Received',
                        description: `Received ${itemFloodBuffer.length} items in a short period.`,
                        color: 0xffcd42,
                        timestamp: new Date().toISOString(),
                    };
                    await channel.send({ embeds: [embed] });
                } else {
                    console.log(itemFloodBuffer);
                    for (const item of itemFloodBuffer) {
                        console.log(item);
                        const embed = {
                            title: 'Item Received',
                            description: `**Item:** ${item.name || 'Unknown'}\n**From:** ${item.sender || 'Unknown'}\n**Receiver:** ${item.receiver || ''}`,
                            color: 0x5bfc32,
                            timestamp: new Date().toISOString(),
                        };
                        await channel.send({ embeds: [embed] });
                    }
                }
                itemFloodBuffer = [];
                itemFloodTimeout = null;
            }, 5000); // Wait 5s after last item before sending
    });

    apClient.items.on('hintReceived', async (hint) => {
        const channel = await getTextChannel(discordClient, channelId);
        if (!channel) return;
        const embed = {
            title: 'Hint Received',
            description: `**Hint:** ${hint.item} at entrance [${hint.entrance}]`,
            color: 0xa940ffff,
            timestamp: new Date().toISOString(),
        };
        channel.send({ embeds: [embed] });
    });

    apClient.items.on('hintFound', async (hint) => {
        const channel = await getTextChannel(discordClient, channelId);
        if (!channel) return;
        const embed = {
            title: 'Hint Found',
                description: `**Hint:** ${hint.item} at entrance [${hint.entrance}]`,
            color: 0xa940ffff,
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
            color: 0x3b0909ff,
            timestamp: new Date().toISOString(),
        };
        channel.send({ embeds: [embed] });
    });

    apClient.messages.on('goaled', async () => {
        const channel = await getTextChannel(discordClient, channelId);
        if (!channel) return;
        await handleGoalAchieved(channelId, slotName, discordClient);
    });

        apClient.messages.on('released', async () => {
        const channel = await getTextChannel(discordClient, channelId);
        if (!channel) return;
        await handleGoalAchieved(channelId, slotName, discordClient, true);
    });

    // Login to the server
    apClient.login(`archipelago.gg:${port}`, slotName)
        .then(async () => {
            const channel = await getTextChannel(discordClient, channelId);
            if (channel) channel.send({ content: `Currently pretending to be [${slotName}] on port ${port}` });
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
            console.error(`[AP] Could not fetch channel ${channelId}:`, e);
            return null;
        }
    }
    return channel;
}

module.exports = { loadArchipelagoRooms, connectArchipelagoRoom, archipelagoGames, getPlayerCount };