const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { query } = require('../utility/db.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('wishlistcheck')
        .setDescription('View all cards you own that match other users’ wishlists.'),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        console.log(`🔍 Wishlist check initiated by ${interaction.user.username} (${interaction.user.id})`);

        const discordUser = interaction.user;

        try {
            // Fetch first matching wishlisted card for each user
            const matches = await query(
                `SELECT w.pod_scryfallid, w.pod_oracleid, w.pod_quantity AS wish_quantity, 
                        i.pod_quantity AS own_quantity, u.pod_userpreferred, u.pod_username
                 FROM pod_wishlist w
                 JOIN pod_inventory i ON w.pod_oracleid = i.pod_oracleid
                 JOIN pod_users u ON w.pod_userid = u.pod_userid
                 WHERE i.pod_userid = ?
                 LIMIT 10`, // Adjust TAKE value as needed
                [discordUser.id] 
            );

            if (matches.length === 0) {
                return await interaction.editReply({ content: "❌ No wishlist matches found for your inventory.", ephemeral: true });
            }

            // Use LIMIT 1 (FIRST) for exact matches
            const exactMatches = await query(
                `SELECT w.pod_scryfallid, w.pod_oracleid, w.pod_quantity AS wish_quantity, 
                        i.pod_quantity AS own_quantity, u.pod_userpreferred, u.pod_username
                 FROM pod_wishlist w
                 JOIN pod_inventory i ON w.pod_scryfallid = i.pod_scryfallid
                 JOIN pod_users u ON w.pod_userid = u.pod_userid
                 WHERE i.pod_userid = ?
                 LIMIT 1`,
                [discordUser.id]
            );

            let embed = new EmbedBuilder()
                .setColor(0x3498DB)
                .setTitle(`${discordUser.username}'s Wishlist Check`)
                .setTimestamp();

            let description = "";

            if (exactMatches.length > 0) {
                description += "**🔹 Exact Matches:**\n";
                exactMatches.forEach(match => {
                    description += `• **${match.pod_userpreferred}** (*@${match.pod_username}*) wants **${match.wish_quantity}x** (You own ${match.own_quantity}x)\n`;
                });
            } else {
                description += "**🔹 Exact Matches:**\n*None found.*\n";
            }

            if (matches.length > 0) {
                description += "\n**🔸 Similar Matches:**\n";
                matches.forEach(match => {
                    description += `• **${match.pod_userpreferred}** (*@${match.pod_username}*) wants **${match.wish_quantity}x** (You own ${match.own_quantity}x, different print)\n`;
                });
            } else {
                description += "\n**🔸 Similar Matches:**\n*None found.*\n";
            }

            embed.setDescription(description);
            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('❌ Error checking wishlist:', error);
            await interaction.editReply({ content: "❌ An error occurred while checking wishlists.", ephemeral: true });
        }
    }
};
