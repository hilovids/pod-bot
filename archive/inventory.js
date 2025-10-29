const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { query } = require('../utility/db.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('inventory')
        .setDescription('View a user’s card inventory.')
        .addUserOption(option => 
            option.setName('user')
                .setDescription('The user whose inventory you want to view (default: you)')
                .setRequired(false)
        ),
    async execute(interaction) {
        await interaction.deferReply(); // Prevents timeout
        const discordUser = interaction.options.getUser('user') || interaction.user;
        const userId = discordUser.id;
        
        try {
            // Fetch user's inventory from database
            const inventory = await query(
                `SELECT pod_scryfallid, pod_quantity, pod_isfoil 
                 FROM pod_inventory WHERE pod_userid = ?`, 
                [userId]
            );

            if (inventory.length === 0) {
                return await interaction.editReply({ content: `❌ ${discordUser.username} has no cards in their inventory.` });
            }

            // Fetch card details from Scryfall
            let cardDetails = [];
            for (const item of inventory) {
                const scryfallResponse = await fetch(`https://api.scryfall.com/cards/${item.pod_scryfallid}`);
                if (!scryfallResponse.ok) continue;

                const cardData = await scryfallResponse.json();
                const price = item.pod_isfoil ? cardData.prices.usd_foil : cardData.prices.usd;
                cardDetails.push({
                    name: cardData.name,
                    set: cardData.set_name,
                    quantity: item.pod_quantity,
                    isFoil: item.pod_isfoil ? "Foil" : "Non-Foil",
                    price: price ? `$${parseFloat(price).toFixed(2)}` : "N/A",
                    image: cardData.image_uris?.normal || cardData.image_uris?.small
                });
            }

            // Pagination setup
            const pageSize = 20;
            let currentPage = 0;

            const generateEmbed = (page) => {
                const start = page * pageSize;
                const end = start + pageSize;
                const pageCards = cardDetails.slice(start, end);

                let description = pageCards.map(card =>
                    `**${card.name}** - ${card.set} - ${card.quantity}x ${card.isFoil} - ${card.price}`
                ).join("\n");

                return new EmbedBuilder()
                    .setColor(0x3498DB)
                    .setTitle(`${discordUser.username}'s Inventory`)
                    .setDescription(description || "No cards found.")
                    .setFooter({ text: `Page ${page + 1} of ${Math.ceil(cardDetails.length / pageSize)}` });
            };

            const message = await interaction.editReply({ embeds: [generateEmbed(0)] });

            // If only one page, no reactions needed
            if (cardDetails.length <= pageSize) return;

            await message.react('⬅️');
            await message.react('➡️');

            const filter = (reaction, user) => {
                return ['⬅️', '➡️'].includes(reaction.emoji.name) && user.id === interaction.user.id;
            };

            const collector = message.createReactionCollector({ filter, time: 60000 });

            collector.on('collect', async (reaction, user) => {
                if (reaction.emoji.name === '⬅️' && currentPage > 0) {
                    currentPage--;
                } else if (reaction.emoji.name === '➡️' && currentPage < Math.ceil(cardDetails.length / pageSize) - 1) {
                    currentPage++;
                }

                await message.edit({ embeds: [generateEmbed(currentPage)] });
                await reaction.users.remove(user.id);
            });

            collector.on('end', async () => {
                try {
                    await message.reactions.removeAll();
                } catch (error) {
                    console.error("Failed to remove reactions:", error);
                }
            });

        } catch (error) {
            console.error('Error fetching inventory:', error);
            await interaction.editReply({ content: "❌ An error occurred while fetching inventory." });
        }
    }
};
