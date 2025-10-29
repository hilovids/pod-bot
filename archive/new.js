const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { query } = require('../utility/db.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('new')
        .setDescription('Manually create a collection pod for this server.'),
    async execute(interaction) {
        const guild = interaction.guild;
        
        try {

            const guildPod = await query(
                `SELECT pod_groupid FROM pod_groups WHERE pod_groupname = ?;`,
                [guild.id]
            );

            if (guildPod.length != 0) {
                const createdEmbed = new EmbedBuilder()
                .setColor(0xFFD700)
                .setTitle(`⚠️ Pod Already Exists`)
                .setDescription(`This server already has a pod!`)
                .setTimestamp();

                return await interaction.reply({ embeds: [createdEmbed], flags: MessageFlags.Ephemeral });
            }

            await query(
                `INSERT INTO pod_groups (pod_groupid, pod_groupname) 
                 VALUES (UUID(), ?) 
                 ON DUPLICATE KEY UPDATE pod_groupname = VALUES(pod_groupname);`,
                [guild.id]
            );

            const exampleEmbed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle(`✅ Pod Created`)
                .setDescription(`A new pod group has been created for this server!`)
                .setTimestamp();

            await interaction.reply({ embeds: [exampleEmbed] });
        } catch (error) {
            console.error('Error creating pod:', error);
            const errorEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle(`❌ Error`)
                .setDescription(`An error occurred while creating the pod group.`)
                .setTimestamp();

            await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
        }
    }
};
