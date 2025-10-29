const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { query } = require('../utility/db.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('join')
        .setDescription('Joins the pod for this server.')
        .addStringOption(option => 
            option.setName('preferred_name')
                .setDescription('Your preferred display name')
                .setRequired(false)
        ),
    async execute(interaction) {
        const discordUser = interaction.user;
        const guild = interaction.guild;
        const preferredName = interaction.options.getString('preferred_name') || null;        

        try {
            // Check if the user already exists in pod_users
            const existingUser = await query(
                `SELECT pod_userid FROM pod_users WHERE pod_userid = ?`,
                [discordUser.id]
            );

            if (existingUser.length === 0) {
                await query(
                    `INSERT INTO pod_users (pod_userid, pod_username, pod_userpreferred) VALUES (?, ?, ?);`,
                    [discordUser.id, discordUser.username, preferredName]
                );
            }

            // Ensure the server has a pod group
            const guildPod = await query(
                `SELECT pod_groupid FROM pod_groups WHERE pod_groupname = ?;`,
                [guild.id]
            );

            if (guildPod.length === 0) {
                return await interaction.reply({ content: '❌ This server does not have a pod set up. Ask an admin to run the "new" command.', flags: MessageFlags.Ephemeral });
            }

            const podGroupId = guildPod[0].pod_groupid;

            const existingUserGroup = await query(
                `SELECT pod_userid FROM pod_usergroups WHERE pod_userid = ? AND pod_groupid = ?`,
                [discordUser.id, podGroupId]
            );

            if (existingUserGroup.length === 0) {
                await query(
                    `INSERT INTO pod_usergroups (pod_usergroupid, pod_groupid, pod_userid) VALUES (UUID(), ?, ?);`,
                    [podGroupId, discordUser.id]
                );
                await interaction.reply({ content: `✅ You have successfully joined the pod for this server!`, flags: MessageFlags.Ephemeral });
            }
            else {
                await interaction.reply({ content: `✅ You are already in this server's pod!`, flags: MessageFlags.Ephemeral });
            }
        } catch (error) {
            console.error('Error joining pod:', error);
            await interaction.reply({ content: '❌ An error occurred while joining the pod.', flags: MessageFlags.Ephemeral });
        }
    }
};
