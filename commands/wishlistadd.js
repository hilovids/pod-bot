const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { query } = require('../utility/db.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('wishlistaddcard')
        .setDescription('Manage your wishlist.')
        .addStringOption(option => 
            option.setName('name')
                .setDescription('Name of the card')
                .setRequired(true))
        .addIntegerOption(option => 
            option.setName('quantity')
                .setDescription('How many copies you want')
                .setRequired(false))
        .addBooleanOption(option => 
            option.setName('foil')
                .setDescription('Is this a foil card?')
                .setRequired(false)),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const discordUser = interaction.user;
        const cardName = interaction.options.getString('name');
        const quantity = interaction.options.getInteger('quantity') || 1;
        const isFoil = interaction.options.getBoolean('foil') ? 1 : 0;

        try {
            // Fetch Scryfall data
            console.log(`🔍 Fetching Scryfall data for wishlist: ${cardName}`);
            const scryfallResponse = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cardName)}`);
            if (!scryfallResponse.ok) throw new Error("Card not found.");

            const cardData = await scryfallResponse.json();
            const scryfallId = cardData.id;

            // Insert or update wishlist entry
            await query(
                `INSERT INTO pod_wishlist (pod_wishid, pod_userid, pod_quantity, pod_scryfallid, pod_isfoil)
                 VALUES (UUID(), ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE pod_quantity = pod_quantity + VALUES(pod_quantity);`,
                [discordUser.id, quantity, scryfallId, isFoil]
            );

            console.log(`✅ Added ${quantity}x ${cardName} (Foil: ${isFoil}) to wishlist.`);
            const embed = new EmbedBuilder()
                .setColor(0x3498DB)
                .setTitle(`✅ Wishlist Updated`)
                .setDescription(`You added **${quantity}x ${cardData.name}** (${isFoil ? "Foil" : "Non-Foil"}) to your wishlist.`)
                .setThumbnail(cardData.image_uris?.normal || cardData.image_uris?.small);

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error(`❌ Error adding to wishlist:`, error);
            await interaction.editReply({ content: "❌ Could not add card to wishlist. Make sure the card name is correct." });
        }
    }
};
