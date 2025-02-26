const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { query } = require('../utility/db.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('addcard')
        .setDescription('Add a card to your inventory.')
        .addStringOption(option => 
            option.setName('name')
                .setDescription('The name of the card')
                .setRequired(true)
        )
        .addIntegerOption(option => 
            option.setName('quantity')
                .setDescription('Number of copies to add (default: 1)')
                .setRequired(false)
        )
        .addStringOption(option => 
            option.setName('set')
                .setDescription('The set code of the card')
                .setRequired(false)
        )
        .addStringOption(option => 
            option.setName('collector_number')
                .setDescription('The collector number of the card')
                .setRequired(false)
        )
        .addBooleanOption(option => 
            option.setName('foil')
                .setDescription('Is the card foil? (default: false)')
                .setRequired(false)
        ),
    async execute(interaction) {
        const discordUser = interaction.user;
        const cardName = interaction.options.getString('name');
        const quantity = interaction.options.getInteger('quantity') || 1;
        const set = interaction.options.getString('set');
        const collectorNumber = interaction.options.getString('collector_number');
        const isFoil = interaction.options.getBoolean('foil') ? 1 : 0;

        try {
            let scryfallQuery = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cardName)}`;
            if (set) scryfallQuery += `&set=${set}`;
            if (collectorNumber) scryfallQuery += `&collector_number=${collectorNumber}`;

            const response = await fetch(scryfallQuery);
            if (!response.ok) {
                return await interaction.reply({ content: "❌ Card not found on Scryfall.", flags: MessageFlags.Ephemeral });
            }
            
            const cardData = await response.json();
            const scryfallId = cardData.id;
            const oracleId = cardData.oracle_id; // Universal ID for card versions

            // Check if the card already exists in the user's inventory
            const existingCard = await query(
                `SELECT pod_quantity FROM pod_inventory WHERE pod_userid = ? AND pod_scryfallid = ? AND pod_isfoil = ?;`,
                [discordUser.id, scryfallId, isFoil]
            );

            if (existingCard.length > 0) {
                const newQuantity = existingCard[0].pod_quantity + quantity;
                // If the card exists, update the quantity
                await query(
                    `UPDATE pod_inventory SET pod_quantity = ? WHERE pod_userid = ? AND pod_scryfallid = ? AND pod_isfoil = ?;`,
                    [newQuantity, discordUser.id, scryfallId, isFoil]
                );
            } else {
                // If the card does not exist, insert a new row
                await query(
                    `INSERT INTO pod_inventory (pod_cardid, pod_userid, pod_quantity, pod_scryfallid, pod_oracleid, pod_isfoil) 
                     VALUES (UUID(), ?, ?, ?, ?, ?);`,
                    [discordUser.id, quantity, scryfallId, oracleId, isFoil]
                );
            }

            const exampleEmbed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle(`✅ Card Added`)
                .setDescription(`Successfully added **${quantity}x ${cardData.name}** (${isFoil ? 'Foil' : 'Non-Foil'}) to your inventory.`)
                .setThumbnail(cardData.image_uris?.normal || cardData.image_uris?.small)
                .setTimestamp();

            await interaction.reply({ embeds: [exampleEmbed] });
        } catch (error) {
            console.error('Error adding card to inventory:', error);
            const errorEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle(`❌ Error`)
                .setDescription(`An error occurred while adding your card.`)
                .setTimestamp();

            await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
        }
    }
};
