const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { query } = require('../utility/db.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('delete')
        .setDescription('Delete your pod account from the system.'),
    async execute(interaction) {
        const discordUser = interaction.user;

        try {
            // Delete user data from related tables first
            await query(`DELETE FROM pod_wishlist WHERE pod_userid = ?;`, [discordUser.id]);
            await query(`DELETE FROM pod_inventory WHERE pod_userid = ?;`, [discordUser.id]);
            await query(`DELETE FROM pod_usergroups WHERE pod_userid = ?;`, [discordUser.id]);

            // Delete user from pod_users
            const result = await query(`DELETE FROM pod_users WHERE pod_userid = ?;`, [discordUser.id]);

            if (result.affectedRows === 0) {
                return await interaction.reply({
                    content: "❌ You are not registered in the pod system.",
                    flags: MessageFlags.Ephemeral
                });
            }

            const exampleEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle(`✅ Account Deleted`)
                .setDescription(`Your pod account and all associated data have been successfully removed from the system.`)
                .setTimestamp();

            await interaction.reply({ embeds: [exampleEmbed] });
        } catch (error) {
            console.error('Error deleting pod account:', error);
            const errorEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle(`❌ Error`)
                .setDescription(`An error occurred while deleting your account.`)
                .setTimestamp();

            await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
        }
    }
};
