const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const logger = require('../utils/logger');

class AuthMiddleware {
    /**
     * Chave de criptografia do UniTV
     */
    static ENCRYPTION_KEY = "jb%!SZfM%AwwS7JmdM!";

    /**
     * Derivar chave e IV usando MD5 (compatível com OpenSSL)
     */
    static deriveKeyAndIV(password, salt, keyLen, ivLen) {
        let derivedBytes = Buffer.alloc(0);
        let currentHash = Buffer.alloc(0);

        while (derivedBytes.length < (keyLen + ivLen)) {
            const hash = crypto.createHash('md5');

            if (currentHash.length > 0) {
                hash.update(currentHash);
            }
            hash.update(Buffer.from(password, 'utf8'));
            hash.update(salt);

            currentHash = hash.digest();
            derivedBytes = Buffer.concat([derivedBytes, currentHash]);
        }

        return {
            key: derivedBytes.slice(0, keyLen),
            iv: derivedBytes.slice(keyLen, keyLen + ivLen)
        };
    }

    /**
     * Descriptografar dados em formato OpenSSL (AES-256-CBC)
     */
    static decryptOpenSSLFormat(encryptedData, password) {
        try {
            const encrypted = Buffer.from(encryptedData, 'base64');

            if (encrypted.slice(0, 8).toString() !== 'Salted__') {
                return null;
            }

            const salt = encrypted.slice(8, 16);
            const ciphertext = encrypted.slice(16);

            const keyIv = this.deriveKeyAndIV(password, salt, 32, 16);

            const decipher = crypto.createDecipheriv('aes-256-cbc', keyIv.key, keyIv.iv);
            let decrypted = decipher.update(ciphertext);
            decrypted = Buffer.concat([decrypted, decipher.final()]);

            return decrypted.toString('utf8');
        } catch (error) {
            return null;
        }
    }

    /**
     * Processar dados descriptografados do UniTV
     */
    static parseDecryptedData(decryptedText) {
        if (!decryptedText) return null;

        // Formato: wifi=usuario:senha&lan=usuario:senha&code=NAN&mobile=NAN&isMobile=false
        const params = new URLSearchParams(decryptedText);
        
        // Priorizar wifi, depois lan
        let credentials = params.get('wifi') || params.get('lan');
        
        if (credentials && credentials.includes(':')) {
            const [username, password] = credentials.split(':');
            return { username, password };
        }

        return null;
    }

    /**
     * Middleware para autenticar usuários via credenciais
     */
    static async authenticateUser(req, res, next) {
        try {
            let { username, password, e, t } = req.query;

            // Se há dados criptografados (parâmetro 'e'), descriptografar primeiro
            if (e && t) {
                logger.info(`Auth: Dados criptografados recebidos (t=${t})`);
                
                // URL decode dos dados
                const urlDecoded = decodeURIComponent(e);
                
                // Descriptografar usando a chave do UniTV
                const decryptedData = this.decryptOpenSSLFormat(urlDecoded, this.ENCRYPTION_KEY);
                
                if (decryptedData) {
                    const credentials = this.parseDecryptedData(decryptedData);
                    
                    if (credentials) {
                        username = credentials.username;
                        password = credentials.password;
                        logger.info(`Auth: Dados descriptografados - User: ${username}`);
                    } else {
                        logger.warn(`Auth: Falha ao extrair credenciais: ${decryptedData}`);
                        return res.status(401).json({
                            error: 'Dados de autenticação inválidos',
                            message: 'Formato de credenciais não reconhecido'
                        });
                    }
                } else {
                    logger.warn(`Auth: Falha na descriptografia: ${urlDecoded.substring(0, 50)}...`);
                    return res.status(401).json({
                        error: 'Falha na descriptografia',
                        message: 'Não foi possível descriptografar os dados de autenticação'
                    });
                }
            }

            if (!username || !password) {
                return res.status(401).json({
                    error: 'Credenciais obrigatórias',
                    message: 'Username e password são obrigatórios'
                });
            }

            const user = await User.findByUsername(username);
            
            if (!user) {
                logger.warn(`Auth: Usuário não encontrado: ${username}`);
                return res.status(401).json({
                    error: 'Credenciais inválidas',
                    message: 'Usuário ou senha incorretos'
                });
            }

            const isValidPassword = await user.verifyPassword(password);
            
            // Verificar também se é um token temporário válido
            let isValidAuth = isValidPassword;
            if (!isValidAuth && global.tempTokens && global.tempTokens.has(username)) {
                const tempToken = global.tempTokens.get(username);
                isValidAuth = (password === tempToken);
                
                if (isValidAuth) {
                    logger.info(`Auth: Token temporário válido: ${username}`);
                }
            }
            
            if (!isValidAuth) {
                logger.warn(`Auth: Senha incorreta: ${username}`);
                return res.status(401).json({
                    error: 'Credenciais inválidas',
                    message: 'Usuário ou senha incorretos'
                });
            }

            if (!user.isValid()) {
                logger.warn(`Auth: Usuário inválido: ${username} (Status: ${user.status})`);
                return res.status(403).json({
                    error: 'Usuário inválido',
                    message: user.status === 'expired' ? 'Usuário expirado' : 'Usuário suspenso'
                });
            }

            // Atualizar último login
            await user.updateLastLogin();

            // Adicionar usuário ao request
            req.user = user;
            next();

        } catch (error) {
            logger.error(`Auth: Erro na autenticação: ${error.message}`);
            res.status(500).json({
                error: 'Erro interno',
                message: 'Erro no processo de autenticação'
            });
        }
    }

    /**
     * Middleware para autenticar admins via JWT
     */
    static async authenticateAdmin(req, res, next) {
        try {
            const token = req.header('Authorization')?.replace('Bearer ', '');

            if (!token) {
                return res.status(401).json({
                    error: 'Token obrigatório',
                    message: 'Token de autorização não fornecido'
                });
            }

            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findById(decoded.userId);

            if (!user || !user.is_admin) {
                return res.status(403).json({
                    error: 'Acesso negado',
                    message: 'Apenas administradores podem acessar'
                });
            }

            req.admin = user;
            next();

        } catch (error) {
            if (error.name === 'JsonWebTokenError') {
                return res.status(401).json({
                    error: 'Token inválido',
                    message: 'Token de autorização inválido'
                });
            }
            
            logger.error(`Erro na autenticação admin: ${error.message}`);
            res.status(500).json({
                error: 'Erro interno',
                message: 'Erro no processo de autenticação'
            });
        }
    }

    /**
     * Gerar token JWT para admin
     */
    static generateAdminToken(user) {
        return jwt.sign(
            { userId: user.id, username: user.username, isAdmin: true },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );
    }

    /**
     * Middleware para log de acesso
     */
    static logAccess(req, res, next) {
        const startTime = Date.now();
        
        res.on('finish', async () => {
            try {
                const responseTime = Date.now() - startTime;
                const user = req.user || req.admin;
                
                // Log simplificado em desenvolvimento
                if (process.env.NODE_ENV !== 'production') {
                    logger.info(`${req.method} ${req.originalUrl} - ${res.statusCode} (${responseTime}ms) - User: ${user?.username || 'Anonymous'}`);
                }
                
                // Log detalhado no banco apenas para endpoints importantes
                if (user && (req.originalUrl.includes('/player_api.php') || req.originalUrl.includes('/admin/'))) {
                    const database = require('../config/database');
                    await database.query(`
                        INSERT INTO access_logs (
                            user_id, username, ip_address, endpoint, method, 
                            status_code, response_time, user_agent
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        user.id,
                        user.username,
                        req.ip || req.connection.remoteAddress,
                        req.originalUrl,
                        req.method,
                        res.statusCode,
                        responseTime,
                        req.get('User-Agent') || 'Unknown'
                    ]);
                }
            } catch (error) {
                // Não bloquear resposta por erro de log
                logger.error(`Erro ao salvar log de acesso: ${error.message}`);
            }
        });
        
        next();
    }
}

module.exports = AuthMiddleware;