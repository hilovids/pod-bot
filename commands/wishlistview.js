const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { query } = require('../utility/db.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('wishlistview')
        .setDescription('View your wishlist and who owns each card.')
        .addUserOption(option => 
            option.setName('user')
                .setDescription('The user whose wishlist you want to view (default: you)')
                .setRequired(false)
        ),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: false });

        const discordUser = interaction.options.getUser('user') || interaction.user;
        const userId = discordUser.id;

        try {
            // Fetch wishlist items
            const wishlist = await query(
                `SELECT pod_scryfallid, pod_quantity, pod_isfoil 
                 FROM pod_wishlist WHERE pod_userid = ?`, 
                [userId]
            );

            if (wishlist.length === 0) {
                return await interaction.editReply({ content: `❌ You have no cards in your wishlist.` });
            }

            // Fetch owner details for each card
            let wishlistDetails = [];
            for (const item of wishlist) {
                const scryfallResponse = await fetch(`https://api.scryfall.com/cards/${item.pod_scryfallid}`);
                if (!scryfallResponse.ok) continue;

                const cardData = await scryfallResponse.json();

                // Fetch owners of the card from the inventory
                const owners = await query(
                    `SELECT pod_users.pod_userpreferred, pod_users.pod_username, pod_users.pod_userid, pod_inventory.pod_quantity, pod_inventory.pod_isfoil
                     FROM pod_inventory 
                     JOIN pod_users ON pod_inventory.pod_userid = pod_users.pod_userid
                     WHERE pod_inventory.pod_scryfallid = ?`,
                    [item.pod_scryfallid]
                );

                const ownersList = owners.length > 0
                    ? owners.map(owner => `<@${owner.pod_userid}> (${owner.pod_userpreferred}) - ${owner.pod_quantity}x ${owner.pod_isfoil ? "Foil" : "Non-Foil"}`).join("\n")
                    : "No one in the server owns this card.";

                wishlistDetails.push({
                    name: cardData.name,
                    set: cardData.set_name,
                    quantity: item.pod_quantity,
                    isFoil: item.pod_isfoil ? "Foil" : "Non-Foil",
                    image: cardData.image_uris?.normal || cardData.image_uris?.small,
                    owners: ownersList
                });
            }

            // Pagination setup
            const pageSize = 3; // Show 5 wishlist items per page
            let currentPage = 0;

            const generateEmbed = (page) => {
                const start = page * pageSize;
                const end = start + pageSize;
                const pageCards = wishlistDetails.slice(start, end);

                let description = pageCards.map(card =>
                    `**${card.name}** (${card.set}) - ${card.quantity}x ${card.isFoil}\n📜 **Owners:**\n${card.owners}`
                ).join("\n\n");

                return new EmbedBuilder()
                    .setColor(0xF1C40F)
                    .setTitle(`${discordUser.username}'s Wishlist`)
                    .setDescription(description || "No cards found.")
                    .setFooter({ text: `Page ${page + 1} of ${Math.ceil(wishlistDetails.length / pageSize)}` });
            };

            const message = await interaction.editReply({ embeds: [generateEmbed(0)], fetchReply: true });

            // If only one page, no reactions needed
            if (wishlistDetails.length <= pageSize) return;

            await message.react('⬅️');
            await message.react('➡️');

            // Reaction collector for navigation
            const filter = (reaction, user) => ['⬅️', '➡️'].includes(reaction.emoji.name) && user.id === interaction.user.id;
            const collector = message.createReactionCollector({ filter, time: 60000 });

            collector.on('collect', (reaction) => {
                if (reaction.emoji.name === '⬅️' && currentPage > 0) {
                    currentPage--;
                } else if (reaction.emoji.name === '➡️' && currentPage < Math.ceil(wishlistDetails.length / pageSize) - 1) {
                    currentPage++;
                }

                message.edit({ embeds: [generateEmbed(currentPage)] });
                reaction.users.remove(interaction.user.id);
            });

            collector.on('end', () => message.reactions.removeAll());

        } catch (error) {
            console.error('Error fetching wishlist:', error);
            await interaction.editReply({ content: "❌ An error occurred while fetching your wishlist." });
        }
    }
};
