const mysql = require('mysql');
const util = require('util');
const dotenv = require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.MYSQL_HOST || 'localhost',
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASS || '',
    database: process.env.MYSQL_DB || 'discord_bot',
    port: process.env.MYSQL_PORT || '3306',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

pool.query = util.promisify(pool.query);

/**
 * Executes a SQL query with provided parameters.
 * @param {string} sql - The SQL query string.
 * @param {Array} params - The query parameters.
 * @returns {Promise<Array>} - The query results.
 */
async function query(sql, params = []) {
    try {
        return await pool.query(sql, params);
    } catch (error) {
        console.error('Database Query Error:', error);
        throw error;
    }
}

process.on('SIGINT', () => {
    console.log('Closing database connection pool...');
    pool.end((err) => {
        if (err) console.error('Error closing database pool:', err);
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('Closing database connection pool...');
    pool.end((err) => {
        if (err) console.error('Error closing database pool:', err);
        process.exit(0);
    });
});

module.exports = { query, pool };