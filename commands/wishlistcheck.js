const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { query } = require('../utility/db.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('wishlistcheck')
        .setDescription('Check which cards from your wishlist are available from other users.')
        .addUserOption(option => 
            option.setName('user')
                .setDescription('The user whose wishlist you want to check (default: you)')
                .setRequired(false)
        )
        .addStringOption(option => 
            option.setName('match_type')
                .setDescription('Filter results by match type')
                .setRequired(false)
                .addChoices(
                    { name: 'Exact', value: 'exact' },
                    { name: 'Similar', value: 'similar' },
                    { name: 'Both', value: 'both' }
                )
        ),
    
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: false });

        const discordUser = interaction.options.getUser('user') || interaction.user;
        const userId = discordUser.id;
        const matchType = interaction.options.getString('match_type') || 'both';

        try {
            // Query the wishlist
            const wishlist = await query(
                `SELECT pod_scryfallid, pod_oracleid, pod_quantity 
                 FROM pod_wishlist 
                 WHERE pod_userid = ?`, 
                [userId]
            );

            if (wishlist.length === 0) {
                return await interaction.editReply({ content: `❌ ${discordUser.username} has no cards in their wishlist.` });
            }

            let exactMatches = [];
            let similarMatches = [];

            for (const wish of wishlist) {
                // Find exact matches (same scryfallid and oracleid)
                const exactOwners = await query(
                    `SELECT pod_users.pod_userpreferred, pod_users.pod_username, pod_inventory.pod_quantity
                     FROM pod_inventory
                     JOIN pod_users ON pod_inventory.pod_userid = pod_users.pod_userid
                     WHERE pod_inventory.pod_scryfallid = ? AND pod_inventory.pod_oracleid = ?`,
                    [wish.pod_scryfallid, wish.pod_oracleid]
                );

                if (exactOwners.length > 0) {
                    exactMatches.push({ cardId: wish.pod_scryfallid, owners: exactOwners });
                }

                // Find similar matches (same oracleid but different scryfallid)
                const similarOwners = await query(
                    `SELECT pod_users.pod_userpreferred, pod_users.pod_username, pod_inventory.pod_quantity, pod_inventory.pod_scryfallid
                     FROM pod_inventory
                     JOIN pod_users ON pod_inventory.pod_userid = pod_users.pod_userid
                     WHERE pod_inventory.pod_oracleid = ? AND pod_inventory.pod_scryfallid != ?`,
                    [wish.pod_oracleid, wish.pod_scryfallid]
                );

                if (similarOwners.length > 0) {
                    similarMatches.push({ cardId: wish.pod_scryfallid, owners: similarOwners });
                }
            }

            // Format response
            let responseText = "";
            if (matchType === "both" || matchType === "exact") {
                responseText += "**🔹 Exact Matches:**\n";
                if (exactMatches.length === 0) {
                    responseText += "_None found._\n";
                } else {
                    for (const match of exactMatches) {
                        responseText += `**• [${match.cardId}](https://scryfall.com/card/${match.cardId})** - Available from:\n`;
                        for (const owner of match.owners) {
                            responseText += `  - **${owner.pod_userpreferred}** (@${owner.pod_username}) - ${owner.pod_quantity}x\n`;
                        }
                    }
                }
            }

            if (matchType === "both" || matchType === "similar") {
                responseText += "\n**🔸 Similar Matches:**\n";
                if (similarMatches.length === 0) {
                    responseText += "_None found._\n";
                } else {
                    for (const match of similarMatches) {
                        responseText += `**• [${match.cardId}](https://scryfall.com/card/${match.cardId})** - Available as different printings from:\n`;
                        for (const owner of match.owners) {
                            responseText += `  - **${owner.pod_userpreferred}** (@${owner.pod_username}) - ${owner.pod_quantity}x [${owner.pod_scryfallid}](https://scryfall.com/card/${owner.pod_scryfallid})\n`;
                        }
                    }
                }
            }

            // Send embed response
            const embed = new EmbedBuilder()
                .setColor(0x3498DB)
                .setTitle(`${discordUser.username}'s Wishlist Check`)
                .setDescription(responseText || "No matches found.")
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error fetching wishlist check:', error);
            await interaction.editReply({ content: "❌ An error occurred while fetching wishlist matches." });
        }
    }
};
