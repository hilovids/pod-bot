const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, MessageFlags } = require('discord.js');
const { query } = require('../utility/db.js');
const fs = require('fs');
const path = require('path');

const TEMP_DIR = path.join(__dirname, '../temp'); // Define local temp directory

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('removebulk')
        .setDescription('Remove cards from your inventory using a TXT file. Format: "1 Dazzling Denial (BLB) 45"')
        .addAttachmentOption(option =>
            option.setName('file')
                .setDescription('Upload a .txt file containing your card list.')
                .setRequired(true)
        ),
    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        console.log(`🟢 Bulk removal started by ${interaction.user.username} (${interaction.user.id})`);

        const discordUser = interaction.user;
        const file = interaction.options.getAttachment('file');

        if (!file || !file.name.endsWith('.txt')) {
            console.log("❌ Invalid file type. Only .txt is allowed.");
            return await interaction.editReply({ content: "❌ Invalid file type. Only .txt files are supported." });
        }

        try {
            console.log(`📥 Fetching file: ${file.name}`);
            const response = await fetch(file.url);
            const fileData = await response.text();
            let cardEntries = [];
            let skippedCards = ["Skipped Cards:"];

            console.log("📄 Processing plain text file...");
            fileData.split('\n').forEach((line, index) => {
                const match = line.match(/(\d+)\s+(.+)/);
                if (!match) {
                    skippedCards.push(`Line ${index + 1}: Invalid format`);
                    return;
                }
                let name = match[2].replace(/\([^)]*\)\s*\d+$/, '').trim();
                cardEntries.push({ quantity: parseInt(match[1]), name });
            });

            if (cardEntries.length === 0) {
                console.log("❌ No valid card entries found.");
                return await interaction.editReply({ content: "❌ No valid card entries found in the file." });
            }

            let processedCount = 0;

            for (const card of cardEntries) {
                let encodedName = encodeURIComponent(card.name);
                let scryfallUrl = `https://api.scryfall.com/cards/named?exact=${encodedName}`;
                let isFoil = 0; // Default: Non-foil

                // Detect foil from format like "Gaea's Will (MH2) 412 F"
                const foilMatch = card.name.match(/F$/); // Check if it ends with "F"
                if (foilMatch) {
                    isFoil = 1; // Set foil flag
                    card.name = card.name.replace(/\sF$/, ''); // Remove "F" from name
                }

                // Check for set code & collector number: "Card Name (SET) 123"
                const setMatch = card.name.match(/\(([^)]+)\)\s*(\d+)$/);
                if (setMatch) {
                    const setCode = setMatch[1].toLowerCase();
                    const collectorNumber = setMatch[2];
                    scryfallUrl = `https://api.scryfall.com/cards/${setCode}/${collectorNumber}`;
                }

                try {
                    const scryfallResponse = await fetch(scryfallUrl);

                    if (!scryfallResponse.ok) {
                        console.log(`⚠️ Skipped: ${card.name} (Not found on Scryfall)`);
                        skippedCards.push(card.name);
                        continue;
                    }

                    const cardData = await scryfallResponse.json();
                    const scryfallId = cardData.id;

                    // Check if the user has the card in inventory
                    const existingCard = await query(
                        `SELECT pod_quantity FROM pod_inventory WHERE pod_userid = ? AND pod_scryfallid = ? AND pod_isfoil = ?;`,
                        [discordUser.id, scryfallId, isFoil]
                    );

                    if (existingCard.length === 0) {
                        console.log(`❌ ${card.name} not found in inventory.`);
                        skippedCards.push(card.name);
                        continue;
                    }

                    const currentQuantity = existingCard[0].pod_quantity;

                    if (card.quantity >= currentQuantity) {
                        // Remove the card completely
                        await query(
                            `DELETE FROM pod_inventory WHERE pod_userid = ? AND pod_scryfallid = ? AND pod_isfoil = ?;`,
                            [discordUser.id, scryfallId, isFoil]
                        );
                        console.log(`🗑️ Removed all copies of ${card.name} from ${discordUser.username}'s inventory`);
                    } else {
                        // Reduce quantity
                        await query(
                            `UPDATE pod_inventory SET pod_quantity = pod_quantity - ? WHERE pod_userid = ? AND pod_scryfallid = ? AND pod_isfoil = ?;`,
                            [card.quantity, discordUser.id, scryfallId, isFoil]
                        );
                        console.log(`🗑️ Removed ${card.quantity}x ${card.name} from ${discordUser.username}'s inventory`);
                    }

                    processedCount++;

                } catch (error) {
                    console.error(`❌ Scryfall API error for ${card.name}:`, error);
                    skippedCards.push(card.name);
                }
            }

            console.log(`✅ Bulk removal complete: ${processedCount}/${cardEntries.length} cards processed.`);

            let description = `Successfully removed **${processedCount}** cards from your collection.`;
            let attachment = null;
            let tempFilePath = null;

            if (skippedCards.length > 0) {
                // Create a temp file in the local temp directory
                tempFilePath = path.join(TEMP_DIR, `skipped_cards_${discordUser.id}.txt`);
                fs.writeFileSync(tempFilePath, skippedCards.join('\n'));
                attachment = new AttachmentBuilder(tempFilePath);
            }

            const successEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle(`✅ Bulk Removal Successful`)
                .setDescription(description)
                .setTimestamp();

            if (attachment) {
                await interaction.followUp({ embeds: [successEmbed], files: [attachment] });

                // Schedule deletion of temp file
                console.log(`🗑️ Deleting temp file: ${tempFilePath}`);
                setTimeout(() => {
                    fs.unlink(tempFilePath, (err) => {
                        if (err) console.error("❌ Error deleting temp file:", err);
                    });
                }, 30000); // Deletes after 30 seconds
            } else {
                await interaction.followUp({ embeds: [successEmbed] });
            }
        } catch (error) {
            console.error('❌ Error processing bulk removal:', error);
            const errorEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle(`❌ Error`)
                .setDescription(`An error occurred while processing your file.`)
                .setTimestamp();

            await interaction.followUp({ embeds: [errorEmbed] });
        }
    }
};
