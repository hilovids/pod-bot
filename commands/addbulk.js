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
        .setName('addbulk')
        .setDescription('Upload your collection as a TXT file. Format: "1 Dazzling Denial (BLB) 45"')
        .addAttachmentOption(option => 
            option.setName('file')
                .setDescription('Upload a .txt file containing your card list.')
                .setRequired(true)
        )
        .addStringOption(option => 
            option.setName('mode')
                .setDescription('Choose to replace or add to your collection')
                .setRequired(true)
                .addChoices(
                    { name: 'Replace', value: 'replace' },
                    { name: 'Add', value: 'add' }
                )
        ),
    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        console.log(`🟢 Bulk import started by ${interaction.user.username} (${interaction.user.id})`);

        const discordUser = interaction.user;
        const file = interaction.options.getAttachment('file');
        const mode = interaction.options.getString('mode');

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

            if (mode === 'replace') {
                console.log("🔄 Replacing existing inventory");
                await query(`DELETE FROM pod_inventory WHERE pod_userid = ?;`, [discordUser.id]);
            }

            let processedCount = 0;
            let insertData = [];

            for (const card of cardEntries) {
                let encodedName = encodeURIComponent(card.name);
                let scryfallUrl = `https://api.scryfall.com/cards/named?exact=${encodedName}`;
                let isFoil = 0; // Default: Non-foil
            
                // Detect foil from format like "Gaea's Will (MH2) 412 F"
                const foilMatch = card.name.match(/F$/); // Check if it ends with "F"
                if (foilMatch) {
                    isFoil = 1; // Set foil flag
                    card.name = card.name.replace(/\sF$/, ''); // Remove "F" from name
                    // console.log(`✨ Detected Foil: ${card.name}`);
                }
            
                // Check for set code & collector number: "Card Name (SET) 123"
                const setMatch = card.name.match(/\(([^)]+)\)\s*(\d+)$/);
                if (setMatch) {
                    const setCode = setMatch[1].toLowerCase();
                    const collectorNumber = setMatch[2];
                    scryfallUrl = `https://api.scryfall.com/cards/${setCode}/${collectorNumber}`;
                    // console.log(`🔍 Fetching specific print: ${card.name} [${setCode} - #${collectorNumber}]`);
                } 
                // else {
                //     console.log(`🔍 Fetching default print: ${card.name}`);
                // }
            
                try {
                    const scryfallResponse = await fetch(scryfallUrl);
                    
                    if (!scryfallResponse.ok) {
                        console.log(`⚠️ Skipped: ${card.name} (Not found on Scryfall)`);
                        console.log(encodedName)
                        skippedCards.push(card.name);
                        continue;
                    }
            
                    const cardData = await scryfallResponse.json();
                    
                    insertData.push([discordUser.id, card.quantity, cardData.id, cardData.oracle_id, isFoil]);
                    processedCount++;
            
                } catch (error) {
                    console.error(`❌ Scryfall API error for ${card.name}:`, error);
                    skippedCards.push(card.name);
                }
            }

            if (insertData.length > 0) {
                console.log(`📥 Bulk inserting ${insertData.length} cards...`);
                await query(
                    `INSERT INTO pod_inventory (pod_cardid, pod_userid, pod_quantity, pod_scryfallid, pod_oracleid, pod_isfoil) 
                     VALUES ${insertData.map(() => `(UUID(), ?, ?, ?, ?, ?)`).join(", ")} 
                     ON DUPLICATE KEY UPDATE pod_quantity = pod_quantity + VALUES(pod_quantity);`,
                    insertData.flat()
                );                
                console.log(`✅ Bulk insert completed successfully.`);
            } else {
                console.log(`⚠️ No valid cards to insert.`);
            }

            console.log(`✅ Bulk import complete: ${processedCount}/${cardEntries.length} cards processed.`);

            let description = `Successfully imported **${processedCount}** cards into your collection.`;
            let attachment = null;
            let tempFilePath = null;

            if (skippedCards.length > 0) {
                // Create a temp file in the local temp directory
                tempFilePath = path.join(TEMP_DIR, `skipped_cards_${discordUser.id}.txt`);
                fs.writeFileSync(tempFilePath, skippedCards.join('\n'));
                attachment = new AttachmentBuilder(tempFilePath);
            }

            const successEmbed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle(`✅ Bulk Import Successful`)
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
            console.error('❌ Error processing bulk import:', error);
            const errorEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle(`❌ Error`)
                .setDescription(`An error occurred while processing your file.`)
                .setTimestamp();

            await interaction.followUp({ embeds: [errorEmbed] });
        }
    }
};
