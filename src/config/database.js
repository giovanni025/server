const mysql = require('mysql2/promise');
const logger = require('../utils/logger');

class Database {
    constructor() {
        this.pool = null;
        this.initialize();
    }

    async initialize() {
        try {
            this.pool = mysql.createPool({
                host: process.env.DB_HOST || 'localhost',
                port: process.env.DB_PORT || 3306,
                user: process.env.DB_USER || 'root',
                password: process.env.DB_PASSWORD || '',
                database: process.env.DB_NAME || 'xtream_users',
                waitForConnections: true,
                connectionLimit: 10,
                queueLimit: 0,
                acquireTimeout: 60000,
                timeout: 60000,
                reconnect: true
            });

            // Testar conexão
            await this.pool.execute('SELECT 1');
            logger.info('✅ Conexão com MySQL estabelecida com sucesso');
            
        } catch (error) {
            logger.error(`❌ Erro ao conectar com MySQL: ${error.message}`);
            throw error;
        }
    }

    async createTables() {
        try {
            // Criar banco se não existir
            const connection = await mysql.createConnection({
                host: process.env.DB_HOST || 'localhost',
                port: process.env.DB_PORT || 3306,
                user: process.env.DB_USER || 'root',
                password: process.env.DB_PASSWORD || ''
            });

            await connection.execute(`CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME || 'xtream_users'}`);
            await connection.end();

            // Tabela de usuários
            await this.pool.execute(`
                CREATE TABLE IF NOT EXISTS users (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    username VARCHAR(50) UNIQUE NOT NULL,
                    password VARCHAR(255) NOT NULL,
                    display_name VARCHAR(100),
                    user_type ENUM('test', 'monthly', 'admin') DEFAULT 'monthly',
                    status ENUM('active', 'suspended', 'expired') DEFAULT 'active',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    expires_at TIMESTAMP NOT NULL,
                    last_login TIMESTAMP NULL,
                    max_connections INT DEFAULT 5,
                    is_admin BOOLEAN DEFAULT FALSE,
                    created_by INT NULL,
                    notes TEXT NULL,
                    INDEX idx_username (username),
                    INDEX idx_status (status),
                    INDEX idx_expires_at (expires_at),
                    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
                )
            `);

            // Tabela de sessões/conexões ativas
            await this.pool.execute(`
                CREATE TABLE IF NOT EXISTS active_connections (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    user_id INT NOT NULL,
                    connection_id VARCHAR(255) UNIQUE NOT NULL,
                    ip_address VARCHAR(45) NOT NULL,
                    user_agent TEXT,
                    stream_type VARCHAR(20),
                    stream_title VARCHAR(255),
                    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_user_id (user_id),
                    INDEX idx_connection_id (connection_id),
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            `);

            // Tabela de logs de acesso
            await this.pool.execute(`
                CREATE TABLE IF NOT EXISTS access_logs (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    user_id INT,
                    username VARCHAR(50),
                    ip_address VARCHAR(45),
                    endpoint VARCHAR(255),
                    method VARCHAR(10),
                    status_code INT,
                    response_time INT,
                    user_agent TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_user_id (user_id),
                    INDEX idx_username (username),
                    INDEX idx_created_at (created_at),
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
                )
            `);

            // Tabela de configurações do sistema
            await this.pool.execute(`
                CREATE TABLE IF NOT EXISTS system_config (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    config_key VARCHAR(100) UNIQUE NOT NULL,
                    config_value TEXT NOT NULL,
                    description TEXT,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                )
            `);

            logger.info('✅ Tabelas criadas/verificadas com sucesso');

        } catch (error) {
            logger.error(`❌ Erro ao criar tabelas: ${error.message}`);
            throw error;
        }
    }

    async query(sql, params = []) {
        try {
            const [rows] = await this.pool.execute(sql, params);
            return rows;
        } catch (error) {
            logger.error(`❌ Erro na query: ${error.message}`);
            throw error;
        }
    }

    async close() {
        if (this.pool) {
            await this.pool.end();
            logger.info('✅ Conexão com MySQL fechada');
        }
    }
}

module.exports = new Database();