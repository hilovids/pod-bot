const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { query } = require('../utility/db.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('removecard')
        .setDescription('Remove a card from your inventory.')
        .addStringOption(option =>
            option.setName('name')
                .setDescription('The exact name of the card to remove.')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('set')
                .setDescription('The set code of the card (e.g., "MH2" for Modern Horizons 2).')
                .setRequired(false)
        )
        .addIntegerOption(option =>
            option.setName('collector_number')
                .setDescription('The collector number of the card.')
                .setRequired(false)
        )
        .addBooleanOption(option =>
            option.setName('foil')
                .setDescription('Specify if the card is foil (true/false). Default: Non-Foil.')
                .setRequired(false)
        )
        .addIntegerOption(option =>
            option.setName('quantity')
                .setDescription('How many copies to remove (default: 1).')
                .setRequired(false)
        ),
    
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const discordUser = interaction.user;
        const cardName = interaction.options.getString('name');
        const setCode = interaction.options.getString('set');
        const collectorNumber = interaction.options.getInteger('collector_number');
        const isFoil = interaction.options.getBoolean('foil') ? 1 : 0; // Default: Non-Foil
        const quantityToRemove = interaction.options.getInteger('quantity') || 1;

        try {
            // Construct Scryfall query URL
            let scryfallUrl = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cardName)}`;

            if (setCode && collectorNumber) {
                scryfallUrl = `https://api.scryfall.com/cards/${setCode.toLowerCase()}/${collectorNumber}`;
            }

            console.log(`🔍 Fetching card info from Scryfall: ${scryfallUrl}`);

            // Fetch card data from Scryfall
            const scryfallResponse = await fetch(scryfallUrl);
            if (!scryfallResponse.ok) {
                return await interaction.editReply({ content: `❌ Could not find **${cardName}** in Scryfall.` });
            }

            const cardData = await scryfallResponse.json();
            const scryfallId = cardData.id;
            const oracleId = cardData.oracle_id;

            console.log(`✅ Scryfall ID: ${scryfallId}, Oracle ID: ${oracleId}`);

            // Check if the user owns this card in their inventory
            const existingEntry = await query(
                `SELECT pod_quantity FROM pod_inventory WHERE pod_userid = ? AND pod_scryfallid = ? AND pod_isfoil = ?`,
                [discordUser.id, scryfallId, isFoil]
            );

            if (existingEntry.length === 0) {
                return await interaction.editReply({ content: `❌ You don't have **${cardName}** in your inventory.` });
            }

            const currentQuantity = existingEntry[0].pod_quantity;

            if (currentQuantity <= quantityToRemove) {
                // Remove the row completely if all copies are being removed
                await query(
                    `DELETE FROM pod_inventory WHERE pod_userid = ? AND pod_scryfallid = ? AND pod_isfoil = ?`,
                    [discordUser.id, scryfallId, isFoil]
                );
                console.log(`🗑️ Removed all copies of ${cardName}`);
            } else {
                // Reduce the quantity if they are only removing part of the stack
                await query(
                    `UPDATE pod_inventory SET pod_quantity = pod_quantity - ? WHERE pod_userid = ? AND pod_scryfallid = ? AND pod_isfoil = ?`,
                    [quantityToRemove, discordUser.id, scryfallId, isFoil]
                );
                console.log(`➖ Reduced quantity of ${cardName} by ${quantityToRemove}`);
            }

            const successEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle(`✅ Card Removed`)
                .setDescription(`Successfully removed **${quantityToRemove}x ${cardName}** from your inventory.`)
                .setTimestamp();

            await interaction.editReply({ embeds: [successEmbed] });

        } catch (error) {
            console.error('❌ Error removing card:', error);
            const errorEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle(`❌ Error`)
                .setDescription(`An error occurred while removing the card from your inventory.`)
                .setTimestamp();

            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }
};
