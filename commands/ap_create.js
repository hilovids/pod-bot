
const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { connectArchipelagoRoom } = require('../utility/archipelago.js');
const db = require('../utility/db');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ap_create')
        .setDescription('Create a channel for an Archipelago game and start watching events.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
            option.setName('port')
                .setDescription('Archipelago game port (e.g., 12345)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('friendlyname')
                .setDescription('Name for the Discord channel')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('slotname')
                .setDescription('Name for a Archipelago slot for the bot to use')
                .setRequired(true)),
    async execute(interaction) {
        const port = interaction.options.getString('port');
        const friendlyName = interaction.options.getString('friendlyname');
        const slotName = interaction.options.getString('slotname');
        const guild = interaction.guild;
        const categoryId = process.env.AP_CATEGORY_ID; // Set this in your .env

        // Create channel
        const channel = await guild.channels.create({
            name: friendlyName,
            type: ChannelType.GuildText,
            parent: categoryId || undefined,
            permissionOverwrites: [
                {
                    id: guild.roles.everyone,
                    allow: [PermissionFlagsBits.ViewChannel],
                },
            ],
        });

        // Get player count from Archipelago
        const { getPlayerCount } = require('../utility/archipelago.js');
        const playerCount = await getPlayerCount(port, slotName);

        // Register the room in the DB for persistent connection
        await db.query(
            'INSERT INTO archipelago_rooms (port_id, channel_id, slot_name, player_count, finished_count) VALUES (?, ?, ?, ?, 0) ON DUPLICATE KEY UPDATE channel_id = VALUES(channel_id), player_count = VALUES(player_count)',
            [port, channel.id, slotName, playerCount]
        );

        await interaction.reply({ content: `Channel #${channel.name} created and registered for Archipelago game ${port} with ${playerCount} player(s).`, ephemeral: true });

        // Connect to the Archipelago room
        await connectArchipelagoRoom(port, channel.id, slotName, interaction.client);
    },
};
