const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { query } = require('../utility/db.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('wishlistcheck')
        .setDescription('View all cards you own that match other users’ wishlists.'),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: false });
        console.log(`🔍 Wishlist check initiated by ${interaction.user.username} (${interaction.user.id})`);

        const discordUser = interaction.user;
        const pageSize = 10; // Number of results per page

        // Function to fetch paginated wishlist matches
        const fetchPage = async (page) => {
            const offset = page * pageSize;
            return await query(
                `SELECT w.pod_scryfallid, w.pod_oracleid, w.pod_quantity AS wish_quantity, 
                        i.pod_quantity AS own_quantity, u.pod_userpreferred, u.pod_userid
                 FROM pod_wishlist w
                 JOIN pod_inventory i ON w.pod_oracleid = i.pod_oracleid
                 JOIN pod_users u ON w.pod_userid = u.pod_userid
                 WHERE i.pod_userid = ?
                 ORDER BY w.pod_oracleid = i.pod_oracleid DESC
                 LIMIT ? OFFSET ?`,
                [discordUser.id, pageSize, offset]
            );
        };

        let currentPage = 0;
        let matches = await fetchPage(currentPage);

        if (matches.length === 0) {
            return await interaction.editReply({ content: "❌ No wishlist matches found for your inventory." });
        }

        // Function to fetch card names from Scryfall API
        const fetchCardNames = async (matches) => {
            const cardData = {};
            for (const match of matches) {
                try {
                    const response = await fetch(`https://api.scryfall.com/cards/${match.pod_scryfallid}`);
                    if (response.ok) {
                        const card = await response.json();
                        cardData[match.pod_scryfallid] = card.name;
                    } else {
                        cardData[match.pod_scryfallid] = "Unknown Card";
                    }
                } catch (error) {
                    console.error(`❌ Scryfall API error for card ID ${match.pod_scryfallid}:`, error);
                    cardData[match.pod_scryfallid] = "Unknown Card";
                }
            }
            return cardData;
        };

        const cardNames = await fetchCardNames(matches);

        const generateEmbed = (pageData, page) => {
            let description = "";
            pageData.forEach(match => {
                const cardName = cardNames[match.pod_scryfallid] || "Unknown Card";
                description += `**${cardName}** - <@${match.pod_userid}> wants **${match.wish_quantity}x** (You own ${match.own_quantity}x)\n`;
            });

            return new EmbedBuilder()
                .setColor(0x3498DB)
                .setTitle(`Cards ${discordUser.username} Owns`)
                .setDescription(description || "*No matches found on this page.*")
                .setFooter({ text: `Page ${page + 1}` })
                .setTimestamp();
        };

        const message = await interaction.editReply({ embeds: [generateEmbed(matches, 0)], fetchReply: true });

        if (matches.length < pageSize) return; // No need for pagination if only one page

        await message.react('⬅️');
        await message.react('➡️');

        const filter = (reaction, user) => ['⬅️', '➡️'].includes(reaction.emoji.name) && user.id === interaction.user.id;
        const collector = message.createReactionCollector({ filter, time: 60000 });

        collector.on('collect', async (reaction) => {
            if (reaction.emoji.name === '⬅️' && currentPage > 0) {
                currentPage--;
            } else if (reaction.emoji.name === '➡️') {
                const nextPage = await fetchPage(currentPage + 1);
                if (nextPage.length === 0) return; // No more pages available
                currentPage++;
                matches = nextPage;
            }

            const updatedCardNames = await fetchCardNames(matches);
            await message.edit({ embeds: [generateEmbed(matches, currentPage)] });
            reaction.users.remove(interaction.user.id);
        });

        collector.on('end', () => message.reactions.removeAll().catch(() => {}));
    }
};
