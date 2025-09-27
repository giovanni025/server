const User = require('../models/User');
const AuthMiddleware = require('../middleware/auth');
const logger = require('../utils/logger');
const database = require('../config/database');

class AdminController {
    /**
     * Login de admin
     */
    static async login(req, res) {
        try {
            const { username, password } = req.body;

            if (!username || !password) {
                return res.status(400).json({
                    error: 'Credenciais obrigatórias',
                    message: 'Username e password são obrigatórios'
                });
            }

            const user = await User.findByUsername(username);
            
            if (!user || !user.is_admin) {
                return res.status(401).json({
                    error: 'Acesso negado',
                    message: 'Credenciais de admin inválidas'
                });
            }

            const isValidPassword = await user.verifyPassword(password);
            
            if (!isValidPassword) {
                return res.status(401).json({
                    error: 'Credenciais inválidas',
                    message: 'Username ou password incorretos'
                });
            }

            const token = AuthMiddleware.generateAdminToken(user);
            
            await user.updateLastLogin();

            res.json({
                success: true,
                message: 'Login realizado com sucesso',
                token,
                admin: {
                    id: user.id,
                    username: user.username,
                    display_name: user.display_name
                }
            });

        } catch (error) {
            logger.error(`❌ Erro no login admin: ${error.message}`);
            res.status(500).json({
                error: 'Erro interno',
                message: 'Erro no processo de login'
            });
        }
    }

    /**
     * Criar usuário
     */
    static async createUser(req, res) {
        try {
            const {
                user_type = 'monthly',
                validity_days,
                max_connections = 5,
                display_name,
                notes
            } = req.body;

            const userData = {
                user_type,
                validity_days,
                max_connections,
                display_name,
                notes,
                created_by: req.admin.id
            };

            const newUser = await User.create(userData);

            res.status(201).json({
                success: true,
                message: 'Usuário criado com sucesso',
                user: newUser
            });

        } catch (error) {
            logger.error(`❌ Erro ao criar usuário: ${error.message}`);
            res.status(500).json({
                error: 'Erro interno',
                message: error.message
            });
        }
    }

    /**
     * Listar usuários
     */
    static async listUsers(req, res) {
        try {
            const filters = {
                status: req.query.status,
                user_type: req.query.user_type,
                expired: req.query.expired,
                limit: req.query.limit
            };

            const users = await User.findAll(filters);

            // Remover senha dos resultados
            const usersData = users.map(user => ({
                id: user.id,
                username: user.username,
                display_name: user.display_name,
                user_type: user.user_type,
                status: user.status,
                created_at: user.created_at,
                expires_at: user.expires_at,
                last_login: user.last_login,
                max_connections: user.max_connections,
                notes: user.notes,
                is_expired: !user.isValid()
            }));

            res.json({
                success: true,
                count: usersData.length,
                users: usersData
            });

        } catch (error) {
            logger.error(`❌ Erro ao listar usuários: ${error.message}`);
            res.status(500).json({
                error: 'Erro interno',
                message: error.message
            });
        }
    }

    /**
     * Obter detalhes de usuário
     */
    static async getUser(req, res) {
        try {
            const { userId } = req.params;
            const user = await User.findById(userId);

            if (!user) {
                return res.status(404).json({
                    error: 'Usuário não encontrado',
                    message: 'ID de usuário inválido'
                });
            }

            // Buscar conexões ativas
            const connections = await database.query(`
                SELECT connection_id, ip_address, stream_type, stream_title, 
                       started_at, last_activity
                FROM active_connections 
                WHERE user_id = ?
                ORDER BY started_at DESC
            `, [userId]);

            // Buscar logs recentes
            const recentLogs = await database.query(`
                SELECT endpoint, method, status_code, response_time, 
                       user_agent, created_at
                FROM access_logs 
                WHERE user_id = ?
                ORDER BY created_at DESC
                LIMIT 50
            `, [userId]);

            res.json({
                success: true,
                user: {
                    id: user.id,
                    username: user.username,
                    display_name: user.display_name,
                    user_type: user.user_type,
                    status: user.status,
                    created_at: user.created_at,
                    expires_at: user.expires_at,
                    last_login: user.last_login,
                    max_connections: user.max_connections,
                    notes: user.notes,
                    is_expired: !user.isValid(),
                    active_connections: connections.length,
                    connections: connections,
                    recent_activity: recentLogs
                }
            });

        } catch (error) {
            logger.error(`❌ Erro ao obter usuário: ${error.message}`);
            res.status(500).json({
                error: 'Erro interno',
                message: error.message
            });
        }
    }

    /**
     * Renovar usuário
     */
    static async renewUser(req, res) {
        try {
            const { userId } = req.params;
            const { additional_days = 30 } = req.body;

            const result = await User.renew(userId, additional_days);

            res.json({
                success: true,
                message: `Usuário renovado por ${additional_days} dias`,
                new_expiry: result.new_expiry
            });

        } catch (error) {
            logger.error(`❌ Erro ao renovar usuário: ${error.message}`);
            res.status(500).json({
                error: 'Erro interno',
                message: error.message
            });
        }
    }

    /**
     * Atualizar status do usuário
     */
    static async updateUserStatus(req, res) {
        try {
            const { userId } = req.params;
            const { status } = req.body;

            if (!['active', 'suspended', 'expired'].includes(status)) {
                return res.status(400).json({
                    error: 'Status inválido',
                    message: 'Status deve ser: active, suspended ou expired'
                });
            }

            await User.updateStatus(userId, status);

            res.json({
                success: true,
                message: `Status atualizado para: ${status}`
            });

        } catch (error) {
            logger.error(`❌ Erro ao atualizar status: ${error.message}`);
            res.status(500).json({
                error: 'Erro interno',
                message: error.message
            });
        }
    }

    /**
     * Deletar usuário
     */
    static async deleteUser(req, res) {
        try {
            const { userId } = req.params;

            const success = await User.delete(userId);

            if (success) {
                res.json({
                    success: true,
                    message: 'Usuário deletado com sucesso'
                });
            } else {
                res.status(404).json({
                    error: 'Usuário não encontrado',
                    message: 'ID de usuário inválido'
                });
            }

        } catch (error) {
            logger.error(`❌ Erro ao deletar usuário: ${error.message}`);
            res.status(500).json({
                error: 'Erro interno',
                message: error.message
            });
        }
    }

    /**
     * Estatísticas do sistema
     */
    static async getStatistics(req, res) {
        try {
            const stats = await database.query(`
                SELECT 
                    (SELECT COUNT(*) FROM users WHERE status = 'active') as active_users,
                    (SELECT COUNT(*) FROM users WHERE status = 'suspended') as suspended_users,
                    (SELECT COUNT(*) FROM users WHERE status = 'expired') as expired_users,
                    (SELECT COUNT(*) FROM users WHERE user_type = 'test') as test_users,
                    (SELECT COUNT(*) FROM users WHERE user_type = 'monthly') as monthly_users,
                    (SELECT COUNT(*) FROM active_connections) as active_connections,
                    (SELECT COUNT(*) FROM users WHERE expires_at < NOW()) as needs_cleanup,
                    (SELECT COUNT(*) FROM access_logs WHERE created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)) as requests_today
            `);

            const recentUsers = await database.query(`
                SELECT username, user_type, created_at, expires_at, status
                FROM users 
                ORDER BY created_at DESC 
                LIMIT 10
            `);

            const expiringSoon = await database.query(`
                SELECT username, user_type, expires_at, status
                FROM users 
                WHERE expires_at BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 7 DAY)
                AND status = 'active'
                ORDER BY expires_at ASC
                LIMIT 20
            `);

            res.json({
                success: true,
                statistics: stats[0],
                recent_users: recentUsers,
                expiring_soon: expiringSoon
            });

        } catch (error) {
            logger.error(`❌ Erro ao obter estatísticas: ${error.message}`);
            res.status(500).json({
                error: 'Erro interno',
                message: error.message
            });
        }
    }

    /**
     * Logs do sistema
     */
    static async getLogs(req, res) {
        try {
            const { limit = 100, user_id, status_code } = req.query;

            let query = `
                SELECT al.*, u.username as user_name
                FROM access_logs al
                LEFT JOIN users u ON al.user_id = u.id
                WHERE 1=1
            `;
            const params = [];

            if (user_id) {
                query += ' AND al.user_id = ?';
                params.push(user_id);
            }

            if (status_code) {
                query += ' AND al.status_code = ?';
                params.push(status_code);
            }

            query += ' ORDER BY al.created_at DESC LIMIT ?';
            params.push(parseInt(limit));

            const logs = await database.query(query, params);

            res.json({
                success: true,
                count: logs.length,
                logs: logs
            });

        } catch (error) {
            logger.error(`❌ Erro ao obter logs: ${error.message}`);
            res.status(500).json({
                error: 'Erro interno',
                message: error.message
            });
        }
    }

    /**
     * Limpar usuários expirados
     */
    static async cleanupExpiredUsers(req, res) {
        try {
            await User.cleanupExpired();
            
            res.json({
                success: true,
                message: 'Limpeza de usuários expirados executada'
            });

        } catch (error) {
            logger.error(`❌ Erro na limpeza: ${error.message}`);
            res.status(500).json({
                error: 'Erro interno',
                message: error.message
            });
        }
    }
}

module.exports = AdminController;