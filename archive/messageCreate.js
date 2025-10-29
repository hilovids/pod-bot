const { Events, EmbedBuilder } = require('discord.js');
const { query } = require('../utility/db.js');

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        if (message.author.bot) return;

        // Detect card names within double braces: {{Card Name}}
        const cardMatches = message.content.match(/{{(.*?)}}/g);
        if (!cardMatches) return;

        for (const match of cardMatches) {
            const cardName = match.slice(2, -2).trim();

            try {
                // Fetch card details from Scryfall
                const scryfallResponse = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cardName)}`);
                if (!scryfallResponse.ok) continue;
                
                const cardData = await scryfallResponse.json();
                const oracleId = cardData.oracle_id;
                const scryfallId = cardData.id;

                // Query inventory
                let owners = await query(
                    `SELECT pod_users.pod_userpreferred, pod_users.pod_username, pod_users.pod_userid,
                            pod_inventory.pod_quantity, pod_inventory.pod_isfoil
                     FROM pod_inventory
                     JOIN pod_users ON pod_inventory.pod_userid = pod_users.pod_userid
                     WHERE pod_inventory.pod_oracleid = ?`,
                    [oracleId]
                );

                if (owners.length === 0) {
                    message.reply(`🔍 No one in this server has **${cardName}** in their inventory.`);
                    continue;
                }

                // Add prices & format owner list
                owners = owners.map(owner => {
                    const price = owner.pod_isfoil ? cardData.prices.usd_foil : cardData.prices.usd;
                    return {
                        ...owner,
                        price: price ? parseFloat(price) : null,
                        formattedPrice: price ? `$${parseFloat(price).toFixed(2)}` : "N/A"
                    };
                });

                // Sort by ascending price
                owners.sort((a, b) => (a.price || 0) - (b.price || 0));

                // Limit to 10 owners and handle overflow message
                const maxOwners = 10;
                const displayedOwners = owners.slice(0, maxOwners);
                const remainingOwners = owners.length - maxOwners;

                let ownerList = displayedOwners.map(owner => 
                    `**<@${owner.pod_userid}>** (${owner.pod_userpreferred || owner.pod_username}) - ` +  
                    `\`${owner.pod_quantity}x ${owner.pod_isfoil ? 'Foil    ' : 'Non-Foil'}  -  ${owner.formattedPrice}\``
                ).join("\n");

                if (remainingOwners > 0) {
                    ownerList += `\n... and ${remainingOwners} more.`;
                }

                // Create embed
                const embed = new EmbedBuilder()
                    .setColor(0x3498DB)
                    .setTitle(`📖 Inventory Lookup: ${cardData.name}`)
                    .setDescription(ownerList)
                    .setThumbnail(cardData.image_uris?.normal || cardData.image_uris?.small)
                    .setFooter({ text: "Card info provided by Scryfall" })
                    .setTimestamp();

                message.reply({ embeds: [embed] });

            } catch (error) {
                console.error(`Error fetching card data:`, error);
            }
        }
    }
};
