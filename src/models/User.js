const database = require('../config/database');
const bcrypt = require('bcryptjs');
const CredentialGenerator = require('../utils/credentialGenerator');
const logger = require('../utils/logger');

class User {
    constructor(data = {}) {
        this.id = data.id;
        this.username = data.username;
        this.password = data.password;
        this.display_name = data.display_name;
        this.user_type = data.user_type || 'monthly';
        this.status = data.status || 'active';
        this.created_at = data.created_at;
        this.expires_at = data.expires_at;
        this.last_login = data.last_login;
        this.max_connections = data.max_connections || 5;
        this.is_admin = data.is_admin || false;
        this.created_by = data.created_by;
        this.notes = data.notes;
    }

    /**
     * Criar novo usuário
     */
    static async create(userData) {
        try {
            // Gerar credenciais se não fornecidas
            let username = userData.username;
            if (!username) {
                do {
                    username = CredentialGenerator.generateUsername();
                } while (await User.findByUsername(username));
            }

            const password = userData.password || CredentialGenerator.generatePassword();
            const hashedPassword = await bcrypt.hash(password, 12);
            
            const expiresAt = userData.expires_at || 
                CredentialGenerator.calculateExpirationDate(userData.user_type, userData.validity_days);

            const result = await database.query(`
                INSERT INTO users (
                    username, password, display_name, user_type, status,
                    expires_at, max_connections, is_admin, created_by, notes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                username,
                hashedPassword,
                userData.display_name || username,
                userData.user_type || 'monthly',
                userData.status || 'active',
                expiresAt,
                userData.max_connections || 5,
                userData.is_admin || false,
                userData.created_by || null,
                userData.notes || null
            ]);

            logger.info(`✅ Usuário criado: ${username} (ID: ${result.insertId})`);

            return {
                id: result.insertId,
                username,
                password, // Retorna senha original para mostrar ao admin
                display_name: userData.display_name || username,
                user_type: userData.user_type || 'monthly',
                expires_at: expiresAt
            };

        } catch (error) {
            logger.error(`❌ Erro ao criar usuário: ${error.message}`);
            throw error;
        }
    }

    /**
     * Buscar usuário por username
     */
    static async findByUsername(username) {
        try {
            const users = await database.query('SELECT * FROM users WHERE username = ?', [username]);
            return users.length > 0 ? new User(users[0]) : null;
        } catch (error) {
            logger.error(`❌ Erro ao buscar usuário: ${error.message}`);
            throw error;
        }
    }

    /**
     * Buscar usuário por ID
     */
    static async findById(id) {
        try {
            const users = await database.query('SELECT * FROM users WHERE id = ?', [id]);
            return users.length > 0 ? new User(users[0]) : null;
        } catch (error) {
            logger.error(`❌ Erro ao buscar usuário por ID: ${error.message}`);
            throw error;
        }
    }

    /**
     * Listar todos os usuários
     */
    static async findAll(filters = {}) {
        try {
            let query = 'SELECT * FROM users WHERE 1=1';
            const params = [];

            if (filters.status) {
                query += ' AND status = ?';
                params.push(filters.status);
            }

            if (filters.user_type) {
                query += ' AND user_type = ?';
                params.push(filters.user_type);
            }

            if (filters.expired) {
                if (filters.expired === 'yes') {
                    query += ' AND expires_at < NOW()';
                } else {
                    query += ' AND expires_at > NOW()';
                }
            }

            query += ' ORDER BY created_at DESC';

            if (filters.limit) {
                query += ` LIMIT ${parseInt(filters.limit)}`;
            }

            const users = await database.query(query, params);
            return users.map(user => new User(user));

        } catch (error) {
            logger.error(`❌ Erro ao listar usuários: ${error.message}`);
            throw error;
        }
    }

    /**
     * Verificar se senha está correta
     */
    async verifyPassword(password) {
        return await bcrypt.compare(password, this.password);
    }

    /**
     * Verificar se usuário está válido (não expirado e ativo)
     */
    isValid() {
        const now = new Date();
        const expiresAt = new Date(this.expires_at);
        
        return this.status === 'active' && expiresAt > now;
    }

    /**
     * Atualizar último login
     */
    async updateLastLogin() {
        try {
            await database.query(
                'UPDATE users SET last_login = NOW() WHERE id = ?',
                [this.id]
            );
            this.last_login = new Date();
        } catch (error) {
            logger.error(`❌ Erro ao atualizar último login: ${error.message}`);
        }
    }

    /**
     * Renovar usuário
     */
    static async renew(userId, additionalDays) {
        try {
            const user = await User.findById(userId);
            if (!user) {
                throw new Error('Usuário não encontrado');
            }

            const currentExpiry = new Date(user.expires_at);
            const now = new Date();
            
            // Se já expirou, renovar a partir de agora
            const baseDate = currentExpiry > now ? currentExpiry : now;
            const newExpiry = new Date(baseDate.getTime() + (additionalDays * 24 * 60 * 60 * 1000));

            await database.query(`
                UPDATE users 
                SET expires_at = ?, status = 'active'
                WHERE id = ?
            `, [newExpiry, userId]);

            logger.info(`✅ Usuário ${user.username} renovado até ${newExpiry.toLocaleString()}`);

            return { success: true, new_expiry: newExpiry };

        } catch (error) {
            logger.error(`❌ Erro ao renovar usuário: ${error.message}`);
            throw error;
        }
    }

    /**
     * Deletar usuário
     */
    static async delete(userId) {
        try {
            const result = await database.query('DELETE FROM users WHERE id = ?', [userId]);
            
            if (result.affectedRows > 0) {
                logger.info(`✅ Usuário deletado (ID: ${userId})`);
                return true;
            }
            
            return false;

        } catch (error) {
            logger.error(`❌ Erro ao deletar usuário: ${error.message}`);
            throw error;
        }
    }

    /**
     * Atualizar status do usuário
     */
    static async updateStatus(userId, status) {
        try {
            await database.query(
                'UPDATE users SET status = ? WHERE id = ?',
                [status, userId]
            );
            
            logger.info(`✅ Status do usuário ${userId} atualizado para: ${status}`);
            return true;

        } catch (error) {
            logger.error(`❌ Erro ao atualizar status: ${error.message}`);
            throw error;
        }
    }

    /**
     * Limpar usuários expirados automaticamente
     */
    static async cleanupExpired() {
        try {
            // Atualizar status para expirado
            const result = await database.query(`
                UPDATE users 
                SET status = 'expired' 
                WHERE expires_at < NOW() AND status != 'expired'
            `);

            if (result.affectedRows > 0) {
                logger.info(`🧹 ${result.affectedRows} usuários marcados como expirados`);
            }

            // Opcional: deletar usuários expirados há mais de 30 dias
            const deleteResult = await database.query(`
                DELETE FROM users 
                WHERE status = 'expired' 
                AND expires_at < DATE_SUB(NOW(), INTERVAL 30 DAY)
            `);

            if (deleteResult.affectedRows > 0) {
                logger.info(`🗑️ ${deleteResult.affectedRows} usuários expirados deletados`);
            }

        } catch (error) {
            logger.error(`❌ Erro na limpeza automática: ${error.message}`);
        }
    }
}

module.exports = User;