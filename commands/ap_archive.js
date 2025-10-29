const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../utility/db');
const archipelago = require('../utility/archipelago');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ap_archive')
        .setDescription('Archive an Archipelago room by friendly name.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
            option.setName('friendlyname')
                .setDescription('Name for the Discord channel (friendly name)')
                .setRequired(true)),
    async execute(interaction) {
        const friendlyName = interaction.options.getString('friendlyname');
        const archiveCategoryId = process.env.AP_ARCHIVE_CATEGORY_ID;
        // Find the channel by name
        const channel = interaction.guild.channels.cache.find(c => c.name === friendlyName);
        if (!channel) {
            await interaction.reply({ content: `No channel found with name ${friendlyName}.`, ephemeral: true });
            return;
        }
        // Move channel to archive category
        if (archiveCategoryId) {
            try {
                await channel.setParent(archiveCategoryId);
            } catch (e) {
                await interaction.reply({ content: `Failed to move channel: ${e.message}`, ephemeral: true });
                return;
            }
        }
        // Move DB entry to archive table
        await db.query('INSERT INTO archipelago_rooms_archive SELECT * FROM archipelago_rooms WHERE channel_id = ?', [channel.id]);
        await db.query('DELETE FROM archipelago_rooms WHERE channel_id = ?', [channel.id]);
        // Remove listeners and client
        for (const [slot, obj] of archipelago.archipelagoGames.entries()) {
            if (obj.channelId === channel.id) {
                if (obj.client && obj.client.removeAllListeners) obj.client.removeAllListeners();
                if (obj.client && obj.client.disconnect) obj.client.disconnect();
                archipelago.archipelagoGames.delete(slot);
            }
        }
        await channel.send({ content: 'This channel has been archived by admin command.' });
        await interaction.reply({ content: `Channel #${channel.name} archived.`, ephemeral: true });
    },
};
