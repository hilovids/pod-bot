const { Events, EmbedBuilder } = require('discord.js');
const { query } = require('../utility/db.js');

module.exports = {
    name: Events.GuildCreate,
    async execute(guild) {
        console.log(`🤖 Joined new server: ${guild.name} (${guild.id})`);
        
        try {
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

            const systemChannel = guild.systemChannel;
            if (systemChannel) {
                await systemChannel.send({ embeds: [exampleEmbed] });
            }

            console.log(`✅ Pod ensured for guild: ${guild.name} (${guild.id})`);
        } catch (error) {
            console.error(`❌ Error ensuring pod for ${guild.name}:`, error);
            const errorEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle(`❌ Error`)
                .setDescription(`An error occurred while creating the pod group.`)
                .setTimestamp();

            const systemChannel = guild.systemChannel;
            if (systemChannel) {
                await systemChannel.send({ embeds: [errorEmbed] });
            }
        }
    }
};
