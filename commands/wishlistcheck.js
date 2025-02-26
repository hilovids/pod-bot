const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { query } = require('../utility/db.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('wishlistcheck')
        .setDescription('Check which of your cards are on other users’ wishlists.'),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: false });

        const discordUser = interaction.user;

        try {
            // Fetch wishlist matches
            const matches = await query(
                `SELECT w.pod_userid, w.pod_quantity, w.pod_scryfallid, w.pod_isfoil, u.pod_userpreferred, u.pod_username
                 FROM pod_wishlist w
                 JOIN pod_inventory i ON w.pod_scryfallid = i.pod_scryfallid AND w.pod_isfoil = i.pod_isfoil
                 JOIN pod_users u ON w.pod_userid = u.pod_userid
                 WHERE i.pod_userid = ?;`,
                [discordUser.id]
            );

            if (matches.length === 0) {
                return await interaction.editReply({ content: "✅ You don’t currently own any cards that others are looking for." });
            }

            let wishlistEntries = [];
            for (const item of matches) {
                const scryfallResponse = await fetch(`https://api.scryfall.com/cards/${item.pod_scryfallid}`);
                if (!scryfallResponse.ok) continue;
                
                const cardData = await scryfallResponse.json();
                wishlistEntries.push(
                    `**${cardData.name}** (${item.pod_isfoil ? "Foil" : "Non-Foil"}) - ${item.pod_quantity} wanted by **<@${item.pod_userid}>**`
                );
            }

            const embed = new EmbedBuilder()
                .setColor(0xF1C40F)
                .setTitle(`📜 Wishlist Matches`)
                .setDescription(wishlistEntries.join("\n"))
                .setFooter({ text: "These are the cards you own that others are looking for." });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error(`❌ Error checking wishlists:`, error);
            await interaction.editReply({ content: "❌ An error occurred while checking wishlists." });
        }
    }
};
