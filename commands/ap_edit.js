const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../utility/db');
const archipelago = require('../utility/archipelago');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ap_edit')
        .setDescription('Edit the port or slot name for an Archipelago channel by friendly name.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
            option.setName('friendlyname')
                .setDescription('Name for the Discord channel (friendly name)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('port')
                .setDescription('New Archipelago game port (optional)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('slotname')
                .setDescription('New slot name for the bot (optional)')
                .setRequired(false)),
    async execute(interaction) {
        const friendlyName = interaction.options.getString('friendlyname');
        const newPort = interaction.options.getString('port');
        const newSlot = interaction.options.getString('slotname');
        // Find the channel by name
        const channel = interaction.guild.channels.cache.find(c => c.name === friendlyName);
        if (!channel) {
            await interaction.reply({ content: `No channel found with name ${friendlyName}.`, ephemeral: true });
            return;
        }
        // Get the current DB row
        const rows = await db.query('SELECT * FROM archipelago_rooms WHERE channel_id = ?', [channel.id]);
        if (!rows.length) {
            await interaction.reply({ content: `No Archipelago room registered for channel ${friendlyName}.`, ephemeral: true });
            return;
        }
        const current = rows[0];
        // Update values if provided
        const port = newPort || current.port_id;
        const slot = newSlot || current.slot_name;
        await db.query(
            'UPDATE archipelago_rooms SET port_id = ?, slot_name = ? WHERE channel_id = ?',
            [port, slot, channel.id]
        );
        // Try to reconnect
        await archipelago.connectArchipelagoRoom(port, channel.id, slot, interaction.client);
        await interaction.reply({ content: `Archipelago connection for ${friendlyName} updated. Now using port ${port} and slot ${slot}.`, ephemeral: true });
    },
};
