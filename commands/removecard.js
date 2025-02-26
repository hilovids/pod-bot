const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { query } = require('../utility/db.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('removecard')
        .setDescription('Remove a card from your wishlist.')
        .addStringOption(option =>
            option.setName('cardname')
                .setDescription('The name of the card you want to remove')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('set')
                .setDescription('The set code of the card (e.g., "MH2" for Modern Horizons 2)')
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('collector')
                .setDescription('The collector number of the card (e.g., "412")')
                .setRequired(false)
        )
        .addIntegerOption(option =>
            option.setName('quantity')
                .setDescription('The number of copies to remove (default: 1)')
                .setRequired(false)
        )
        .addBooleanOption(option =>
            option.setName('foil')
                .setDescription('Is the card foil? (default: false)')
                .setRequired(false)
        ),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        const discordUser = interaction.user;
        const cardName = interaction.options.getString('cardname');
        const setCode = interaction.options.getString('set');
        const collectorNumber = interaction.options.getString('collector');
        const quantityToRemove = interaction.options.getInteger('quantity') || 1;
        const isFoil = interaction.options.getBoolean('foil') ? 1 : 0;

        try {
            console.log(`🗑️ ${discordUser.username} requested to remove ${quantityToRemove}x ${cardName} from wishlist`);

            // Construct Scryfall URL based on provided parameters
            let scryfallUrl = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cardName)}`;
            if (setCode && collectorNumber) {
                scryfallUrl = `https://api.scryfall.com/cards/${setCode.toLowerCase()}/${collectorNumber}`;
            }

            // Fetch card data from Scryfall
            const scryfallResponse = await fetch(scryfallUrl);
            if (!scryfallResponse.ok) {
                return await interaction.editReply({ content: `❌ Could not find **${cardName}** with provided set/collector number on Scryfall.` });
            }

            const cardData = await scryfallResponse.json();
            const scryfallId = cardData.id;

            // Check if the user has the card in their wishlist
            const existingCard = await query(
                `SELECT pod_quantity FROM pod_wishlist WHERE pod_userid = ? AND pod_scryfallid = ? AND pod_isfoil = ?;`,
                [discordUser.id, scryfallId, isFoil]
            );

            if (existingCard.length === 0) {
                return await interaction.editReply({ content: `❌ You do not have **${cardName}** in your wishlist.` });
            }

            const currentQuantity = existingCard[0].pod_quantity;

            if (quantityToRemove >= currentQuantity) {
                // Remove the card completely
                await query(
                    `DELETE FROM pod_wishlist WHERE pod_userid = ? AND pod_scryfallid = ? AND pod_isfoil = ?;`,
                    [discordUser.id, scryfallId, isFoil]
                );
                console.log(`🗑️ Removed all copies of ${cardName} from ${discordUser.username}'s wishlist`);
                await interaction.editReply({ content: `✅ Removed all copies of **${cardName}** from your wishlist.` });
            } else {
                // Reduce quantity
                await query(
                    `UPDATE pod_wishlist SET pod_quantity = pod_quantity - ? WHERE pod_userid = ? AND pod_scryfallid = ? AND pod_isfoil = ?;`,
                    [quantityToRemove, discordUser.id, scryfallId, isFoil]
                );
                console.log(`🗑️ Removed ${quantityToRemove}x ${cardName} from ${discordUser.username}'s wishlist`);
                await interaction.editReply({ content: `✅ Removed **${quantityToRemove}x ${cardName}** from your wishlist.` });
            }

        } catch (error) {
            console.error('❌ Error removing card from wishlist:', error);
            await interaction.editReply({ content: `❌ An error occurred while removing **${cardName}**.` });
        }
    }
};
