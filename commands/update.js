const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { query } = require('../utility/db.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('update')
        .setDescription('Update or create your pod account.')
        .addStringOption(option => 
            option.setName('preferred_name')
                .setDescription('Your preferred display name')
                .setRequired(true)
        ),
    async execute(interaction) {
        const discordUser = interaction.user;
        const preferredName = interaction.options.getString('preferred_name');

        try {
            await query(
                `INSERT INTO pod_users (pod_userid, pod_username, pod_userpreferred) 
                 VALUES (UUID(), ?, ?) 
                 ON DUPLICATE KEY UPDATE pod_userpreferred = VALUES(pod_userpreferred);`,
                [discordUser.id, discordUser.username, preferredName]
            );

            const exampleEmbed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle(`✅ Account Updated`)
                .setDescription(`Your preferred name has been set to **${preferredName}**.`)
                .setTimestamp();

            await interaction.reply({ embeds: [exampleEmbed] });
        } catch (error) {
            console.error('Error updating or creating pod account:', error);
            const errorEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle(`❌ Error`)
                .setDescription(`An error occurred while updating or creating your account.`)
                .setTimestamp();

            await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
        }
    }
};