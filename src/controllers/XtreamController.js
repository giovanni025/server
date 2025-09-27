const http = require('http');
const https = require('https');
const url = require('url');
const logger = require('../utils/logger');
const database = require('../config/database');
const CredentialGenerator = require('../utils/credentialGenerator');

class XtreamController {
    constructor() {
        this.liveStreams = new Map();
        this.vodStreams = new Map();
        this.seriesStreams = new Map();
        this.categories = new Map();
        this.activeConnections = new Map();
        this.lastUpdate = null;
        this.updateInterval = 30 * 60 * 1000; // 30 minutos
        this.originalApiUrl = process.env.ORIGINAL_API_URL;
        this.originalCredentials = {
            username: process.env.ORIGINAL_USERNAME,
            password: process.env.ORIGINAL_PASSWORD
        };
    }

    /**
     * Fazer requisições para a API original
     */
    async makeApiRequest(endpoint, params = {}) {
        if (!this.originalApiUrl || !this.originalCredentials.username) {
            throw new Error('Credenciais Xtream não configuradas');
        }

        const queryParams = new URLSearchParams({
            username: this.originalCredentials.username,
            password: this.originalCredentials.password,
            ...params
        });

        const apiUrl = `${this.originalApiUrl}/${endpoint}?${queryParams.toString()}`;
        
        return new Promise((resolve, reject) => {
            const protocol = apiUrl.startsWith('https:') ? https : http;
            
            const req = protocol.request(apiUrl, {
                method: 'GET',
                headers: {
                    'User-Agent': 'Xtream Codes/2.0',
                    'Accept': 'application/json',
                    'Connection': 'close'
                },
                timeout: 30000
            }, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    try {
                        if (res.statusCode === 200) {
                            resolve(JSON.parse(data));
                        } else {
                            reject(new Error(`HTTP ${res.statusCode}`));
                        }
                    } catch (error) {
                        reject(new Error(`JSON Parse Error: ${error.message}`));
                    }
                });
            });

            req.on('error', (err) => reject(err));
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Timeout'));
            });
            req.end();
        });
    }

    /**
     * Carregar dados da API original
     */
    async loadFromXtreamAPI() {
        try {
            logger.info('🔄 Carregando dados da Xtream API...');

            // Carregar Live TV
            const liveStreams = await this.makeApiRequest('player_api.php', { action: 'get_live_streams' });
            this.processLiveStreams(liveStreams);

            // Carregar categorias de Live TV
            const liveCategories = await this.makeApiRequest('player_api.php', { action: 'get_live_categories' });
            this.processCategories(liveCategories, 'live');

            // Carregar VOD (Filmes)
            const vodStreams = await this.makeApiRequest('player_api.php', { action: 'get_vod_streams' });
            this.processVodStreams(vodStreams);

            // Carregar categorias de VOD
            const vodCategories = await this.makeApiRequest('player_api.php', { action: 'get_vod_categories' });
            this.processCategories(vodCategories, 'vod');

            // Carregar Séries
            const seriesStreams = await this.makeApiRequest('player_api.php', { action: 'get_series' });
            this.processSeriesStreams(seriesStreams);

            // Carregar categorias de Séries
            const seriesCategories = await this.makeApiRequest('player_api.php', { action: 'get_series_categories' });
            this.processCategories(seriesCategories, 'series');

            this.lastUpdate = new Date();
            logger.info(`✅ Carregamento concluído: ${this.lastUpdate.toLocaleString()}`);
            this.showStatistics();

        } catch (error) {
            logger.error(`❌ Erro ao carregar da Xtream API: ${error.message}`);
            throw error;
        }
    }

    processLiveStreams(streams) {
        this.liveStreams.clear();
        if (Array.isArray(streams)) {
            streams.forEach(stream => {
                this.liveStreams.set(stream.stream_id.toString(), {
                    stream_id: stream.stream_id,
                    name: stream.name,
                    stream_icon: stream.stream_icon || '',
                    category_id: stream.category_id || '0',
                    epg_channel_id: stream.epg_channel_id || '',
                    added: stream.added || '',
                    is_adult: stream.is_adult || '0',
                    stream_type: 'live'
                });
            });
        }
        logger.info(`📺 ${this.liveStreams.size} canais de TV carregados`);
    }

    processVodStreams(streams) {
        this.vodStreams.clear();
        if (Array.isArray(streams)) {
            streams.forEach(stream => {
                this.vodStreams.set(stream.stream_id.toString(), {
                    stream_id: stream.stream_id,
                    name: stream.name,
                    stream_icon: stream.stream_icon || '',
                    category_id: stream.category_id || '0',
                    added: stream.added || '',
                    rating: stream.rating || '',
                    container_extension: stream.container_extension || 'mp4',
                    stream_type: 'movie'
                });
            });
        }
        logger.info(`🎬 ${this.vodStreams.size} filmes carregados`);
    }

    processSeriesStreams(streams) {
        this.seriesStreams.clear();
        if (Array.isArray(streams)) {
            streams.forEach(series => {
                this.seriesStreams.set(series.series_id.toString(), {
                    series_id: series.series_id,
                    name: series.name,
                    cover: series.cover || '',
                    category_id: series.category_id || '0',
                    plot: series.plot || '',
                    cast: series.cast || '',
                    director: series.director || '',
                    genre: series.genre || '',
                    releaseDate: series.releaseDate || '',
                    last_modified: series.last_modified || '',
                    stream_type: 'series'
                });
            });
        }
        logger.info(`📚 ${this.seriesStreams.size} séries carregadas`);
    }

    processCategories(categories, type) {
        if (Array.isArray(categories)) {
            categories.forEach(category => {
                const categoryKey = `${type}_${category.category_id}`;
                this.categories.set(categoryKey, {
                    category_id: category.category_id,
                    category_name: category.category_name,
                    parent_id: category.parent_id || 0,
                    type: type
                });
            });
            logger.info(`🏷️ ${categories.length} categorias de ${type} carregadas`);
        }
    }

    showStatistics() {
        logger.info('\n📊 ESTATÍSTICAS:');
        logger.info(`📺 TV ao Vivo: ${this.liveStreams.size} canais`);
        logger.info(`🎬 Filmes: ${this.vodStreams.size} títulos`);
        logger.info(`📚 Séries: ${this.seriesStreams.size} títulos`);
        logger.info(`🏷️ Categorias: ${this.categories.size} categorias\n`);
    }

    /**
     * API de autenticação alternativa (compatível com UniTV)
     */
    async handleAlternativeAPI(req, res) {
        const { action } = req.query;
        
        logger.info(`🔐 Alternative API Request: ${action || 'unknown'} - IP: ${req.ip}`);
        
        switch (action) {
            case 'auth':
                return await this.handleUniTVAuth(req, res);
                
            default:
                // Para outras ações, usar autenticação normal e redirecionar
                try {
                    await AuthMiddleware.authenticateUser(req, res, () => {
                        const queryString = new URLSearchParams(req.query).toString();
                        res.redirect(302, `/player_api.php?${queryString}`);
                    });
                } catch (error) {
                    res.status(401).json({
                        error: 'Authentication required',
                        message: 'Invalid credentials'
                    });
                }
                break;
        }
    }

    /**
     * Autenticação específica para UniTV
     */
    async handleUniTVAuth(req, res) {
        try {
            let { username, password, e, t } = req.query;
            
            // Se há dados criptografados (parâmetro 'e'), descriptografar primeiro
            if (e && t) {
                logger.info(`UniTV: Dados criptografados recebidos (t=${t})`);
                
                // URL decode dos dados
                const urlDecoded = decodeURIComponent(e);
                
                // Descriptografar usando a chave do UniTV
                const AuthMiddleware = require('../middleware/auth');
                const decryptedData = AuthMiddleware.decryptOpenSSLFormat(urlDecoded, AuthMiddleware.ENCRYPTION_KEY);
                
                if (decryptedData) {
                    const credentials = AuthMiddleware.parseDecryptedData(decryptedData);
                    
                    if (credentials) {
                        username = credentials.username;
                        password = credentials.password;
                        logger.info(`UniTV: Dados descriptografados - User: ${username}`);
                    } else {
                        logger.warn(`UniTV: Falha ao extrair credenciais: ${decryptedData}`);
                        return res.status(401).json({
                            success: false,
                            message: 'Invalid encrypted data format'
                        });
                    }
                } else {
                    logger.warn(`UniTV: Falha na descriptografia: ${urlDecoded.substring(0, 50)}...`);
                    return res.status(401).json({
                        success: false,
                        message: 'Failed to decrypt authentication data'
                    });
                }
            }

            if (!username || !password) {
                return res.status(401).json({
                    success: false,
                    message: 'Username and password are required'
                });
            }

            // Buscar usuário no banco
            const User = require('../models/User');
            const user = await User.findByUsername(username);
            
            if (!user) {
                logger.warn(`UniTV: Usuário não encontrado: ${username}`);
                return res.status(401).json({
                    success: false,
                    message: 'Invalid credentials'
                });
            }

            // Verificar senha
            const isValidPassword = await user.verifyPassword(password);
            
            // Verificar também se é um token temporário válido
            let isValidAuth = isValidPassword;
            if (!isValidAuth && global.tempTokens && global.tempTokens.has(username)) {
                const tempToken = global.tempTokens.get(username);
                isValidAuth = (password === tempToken);
                
                if (isValidAuth) {
                    logger.info(`UniTV: Autenticação via token temporário: ${username}`);
                }
            }
            
            if (!isValidAuth) {
                logger.warn(`UniTV: Senha incorreta para usuário: ${username}`);
                return res.status(401).json({
                    success: false,
                    message: 'Invalid credentials'
                });
            }

            if (!user.isValid()) {
                logger.warn(`UniTV: Usuário inválido: ${username} (Status: ${user.status})`);
                return res.status(403).json({
                    success: false,
                    message: user.status === 'expired' ? 'Account expired' : 'Account suspended'
                });
            }

            // Atualizar último login
            await user.updateLastLogin();

            // Gerenciar sessões globais
            if (!global.userSessions) global.userSessions = new Map();
            
            let sessionToken;
            let sessionInfo = global.userSessions.get(user.username);
            
            // Se já existe sessão válida, reutilizar
            if (sessionInfo && sessionInfo.expires > Date.now()) {
                sessionToken = sessionInfo.token;
                logger.info(`UniTV: Reutilizando sessão existente: ${user.username}`);
            } else {
                // Criar nova sessão
                sessionToken = `session_${user.id}_${Date.now().toString(36)}`;
                global.userSessions.set(user.username, {
                    token: sessionToken,
                    userId: user.id,
                    expires: Date.now() + (24 * 60 * 60 * 1000) // 24 horas
                });
                logger.info(`UniTV: Nova sessão criada: ${user.username}`);
            }
            
            // Calcular dias de validade
            const validityDays = Math.max(0, Math.floor((new Date(user.expires_at) - new Date()) / (1000 * 60 * 60 * 24)));
            
            // Resposta no formato exato esperado pelo UniTV
            const authResponse = {
                server: `http://${req.get('host')}`,
                username: user.username,
                password: sessionToken,
                success: true,
                validity_days: validityDays,
                ua: 'UniTV/4.14.4',
                message: 'Authentication successful'
            };
            
            logger.info(`UniTV: Autenticação bem-sucedida - User: ${user.username}, Validade: ${validityDays} dias`);
            res.json(authResponse);

        } catch (error) {
            logger.error(`UniTV: Erro na autenticação: ${error.message}`);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }

    /**
     * Middleware para autenticar via sessão do UniTV
     */
    static async authenticateUniTVSession(req, res, next) {
        try {
            const { username, password } = req.params;

            if (!username || !password) {
                return res.status(401).send('Credentials required');
            }

            // Verificar se é uma sessão válida do UniTV
            if (global.userSessions && global.userSessions.has(username)) {
                const sessionInfo = global.userSessions.get(username);
                
                if (sessionInfo.token === password && sessionInfo.expires > Date.now()) {
                    // Buscar usuário
                    const User = require('../models/User');
                    const user = await User.findById(sessionInfo.userId);
                    
                    if (user && user.isValid()) {
                        req.user = user;
                        return next();
                    }
                }
            }

            // Fallback para autenticação normal
            req.query = { username, password };
            const AuthMiddleware = require('../middleware/auth');
            await AuthMiddleware.authenticateUser(req, res, next);

        } catch (error) {
            logger.error(`Erro na autenticação de sessão UniTV: ${error.message}`);
            res.status(401).send('Authentication failed');
        }
    }
                
                logger.info(`Autenticacao aceita para UniTV - User: ${user.username}`);
                res.json(authResponse);
                break;
                
            default:
                // Redirecionar para a API principal
                const queryString = new URLSearchParams(req.query).toString();
                res.redirect(302, `/player_api.php?${queryString}`);
                break;
        }
    }

    /**
     * Handler principal da API Player
     */
    async handlePlayerAPI(req, res) {
        const { action } = req.query;
        const user = req.user; // Vem do middleware de autenticação
        
        try {
            switch (action || 'get_account_info') {
                case 'get_account_info':
                    res.json(await this.getAccountInfo(user));
                    break;

                case 'get_live_streams':
                    res.json(this.getLiveStreams());
                    break;

                case 'get_live_categories':
                    res.json(this.getLiveCategories());
                    break;

                case 'get_vod_streams':
                    res.json(this.getVodStreams());
                    break;

                case 'get_vod_categories':
                    res.json(this.getVodCategories());
                    break;

                case 'get_series':
                    res.json(this.getSeriesStreams());
                    break;

                case 'get_series_categories':
                    res.json(this.getSeriesCategories());
                    break;

                case 'get_vod_info':
                    const vodInfo = await this.getVodInfo(req.query.vod_id);
                    res.json(vodInfo);
                    break;

                case 'get_series_info':
                    const seriesInfo = await this.getSeriesInfo(req.query.series_id);
                    res.json(seriesInfo);
                    break;

                case 'get_short_epg':
                    res.json(await this.getShortEpg(req.query.stream_id, req.query.limit || 100));
                    break;

                default:
                    res.json({
                        error: 'Ação não suportada',
                        requested_action: action,
                        available_actions: [
                            'get_account_info', 'get_live_streams', 'get_live_categories',
                            'get_vod_streams', 'get_vod_categories', 'get_series',
                            'get_series_categories', 'get_vod_info', 'get_series_info', 'get_short_epg'
                        ]
                    });
            }
        } catch (error) {
            logger.error(`❌ Erro na API: ${error.message}`);
            res.status(500).json({ error: 'Erro interno do servidor', message: error.message });
        }
    }

    /**
     * Informações da conta do usuário
     */
    async getAccountInfo(user) {
        return {
            user_info: {
                username: user.username,
                password: "authenticated",
                message: `Conta ativa - ${user.user_type}`,
                auth: 1,
                status: user.status === 'active' ? 'Active' : 'Suspended',
                exp_date: Math.floor(new Date(user.expires_at).getTime() / 1000),
                is_trial: user.user_type === 'test' ? "1" : "0",
                active_cons: "0",
                created_at: Math.floor(new Date(user.created_at).getTime() / 1000),
                max_connections: user.max_connections.toString(),
                allowed_output_formats: ["ts", "m3u8", "mp4"]
            },
            server_info: {
                url: this.originalApiUrl || "http://localhost:3000",
                port: "80",
                https_port: "443",
                server_protocol: "http",
                rtmp_port: "1935",
                timezone: "America/Sao_Paulo",
                timestamp_now: Math.floor(Date.now() / 1000),
                time_now: new Date().toLocaleString()
            }
        };
    }

    getLiveStreams() {
        return Array.from(this.liveStreams.values());
    }

    getLiveCategories() {
        return Array.from(this.categories.values())
            .filter(cat => cat.type === 'live')
            .map(cat => ({
                category_id: cat.category_id,
                category_name: cat.category_name,
                parent_id: cat.parent_id
            }));
    }

    getVodStreams() {
        return Array.from(this.vodStreams.values());
    }

    getVodCategories() {
        return Array.from(this.categories.values())
            .filter(cat => cat.type === 'vod')
            .map(cat => ({
                category_id: cat.category_id,
                category_name: cat.category_name,
                parent_id: cat.parent_id
            }));
    }

    getSeriesStreams() {
        return Array.from(this.seriesStreams.values());
    }

    getSeriesCategories() {
        return Array.from(this.categories.values())
            .filter(cat => cat.type === 'series')
            .map(cat => ({
                category_id: cat.category_id,
                category_name: cat.category_name,
                parent_id: cat.parent_id
            }));
    }

    async getVodInfo(vodId) {
        try {
            return await this.makeApiRequest('player_api.php', { 
                action: 'get_vod_info', 
                vod_id: vodId 
            });
        } catch (error) {
            return { error: `Erro ao obter informações do VOD: ${error.message}` };
        }
    }

    async getSeriesInfo(seriesId) {
        try {
            return await this.makeApiRequest('player_api.php', { 
                action: 'get_series_info', 
                series_id: seriesId 
            });
        } catch (error) {
            return { error: `Erro ao obter informações da série: ${error.message}` };
        }
    }

    async getShortEpg(streamId, limit = 100) {
        try {
            return await this.makeApiRequest('player_api.php', { 
                action: 'get_short_epg', 
                stream_id: streamId, 
                limit: limit 
            });
        } catch (error) {
            return { epg_listings: [] };
        }
    }

    /**
     * Proxy de streams com controle de conexões
     */
    async proxyStream(originalUrl, req, res, user, streamTitle) {
        const connectionId = CredentialGenerator.generateConnectionId();
        
        try {
            // Verificar limite de conexões
            const activeUserConnections = await database.query(
                'SELECT COUNT(*) as count FROM active_connections WHERE user_id = ?',
                [user.id]
            );

            if (activeUserConnections[0].count >= user.max_connections) {
                logger.warn(`🚫 Limite de conexões excedido para usuário: ${user.username}`);
                return res.status(429).json({
                    error: 'Limite de conexões excedido',
                    message: `Máximo ${user.max_connections} conexões permitidas`
                });
            }

            // Registrar conexão ativa
            await database.query(`
                INSERT INTO active_connections (
                    user_id, connection_id, ip_address, user_agent, 
                    stream_type, stream_title
                ) VALUES (?, ?, ?, ?, ?, ?)
            `, [
                user.id,
                connectionId,
                req.ip || req.connection.remoteAddress,
                req.get('User-Agent') || 'Unknown',
                req.originalUrl.includes('/live/') ? 'live' : req.originalUrl.includes('/movie/') ? 'movie' : 'series',
                streamTitle
            ]);

            logger.info(`🎬 Stream iniciado: ${streamTitle} - User: ${user.username} (${connectionId})`);

            // Proxy para servidor original
            await this.performStreamProxy(originalUrl, req, res, connectionId);

        } catch (error) {
            logger.error(`❌ Erro no proxy de stream: ${error.message}`);
            res.status(500).send('Erro no stream');
        } finally {
            // Limpar conexão
            try {
                await database.query('DELETE FROM active_connections WHERE connection_id = ?', [connectionId]);
                logger.info(`🔌 Conexão finalizada: ${connectionId}`);
            } catch (cleanupError) {
                logger.error(`❌ Erro ao limpar conexão: ${cleanupError.message}`);
            }
        }
    }

    async performStreamProxy(originalUrl, req, res, connectionId, maxRedirects = 10) {
        let redirectCount = 0;

        const followRedirect = (urlToTry) => {
            if (redirectCount >= maxRedirects) {
                return res.status(500).send('Muitos redirecionamentos');
            }

            const protocol = urlToTry.startsWith('https:') ? https : http;
            
            const requestHeaders = {
                'User-Agent': req.get('User-Agent') || 'Xtream Codes/2.0',
                'Accept': '*/*',
                'Connection': 'keep-alive'
            };

            const rangeHeader = req.get('Range');
            if (rangeHeader) {
                requestHeaders['Range'] = rangeHeader;
            }

            const proxyReq = protocol.request(urlToTry, {
                method: 'GET',
                headers: requestHeaders,
                timeout: 30000
            }, (proxyRes) => {
                // Tratar redirecionamentos
                if ([302, 301, 307, 308].includes(proxyRes.statusCode)) {
                    const newLocation = proxyRes.headers.location;
                    if (newLocation) {
                        const redirectUrl = url.resolve(urlToTry, newLocation);
                        redirectCount++;
                        proxyReq.destroy();
                        return followRedirect(redirectUrl);
                    }
                }
                
                // Stream válido
                if (proxyRes.statusCode === 200 || proxyRes.statusCode === 206) {
                    const contentType = proxyRes.headers['content-type'] || 'video/mp2t';
                    
                    const responseHeaders = {
                        'Content-Type': contentType,
                        'Accept-Ranges': 'bytes',
                        'Access-Control-Allow-Origin': '*',
                        'Cache-Control': 'no-cache'
                    };

                    // Preservar headers importantes
                    ['content-length', 'content-range', 'last-modified', 'etag'].forEach(header => {
                        if (proxyRes.headers[header]) {
                            responseHeaders[header.split('-').map(s => 
                                s.charAt(0).toUpperCase() + s.slice(1)
                            ).join('-')] = proxyRes.headers[header];
                        }
                    });

                    res.writeHead(proxyRes.statusCode, responseHeaders);
                    proxyRes.pipe(res);
                    
                    // Atualizar atividade da conexão
                    database.query(
                        'UPDATE active_connections SET last_activity = NOW() WHERE connection_id = ?',
                        [connectionId]
                    ).catch(() => {}); // Não bloquear por erro de update
                    
                    return;
                }
                
                res.status(proxyRes.statusCode).send(`Stream indisponível: ${proxyRes.statusCode}`);
            });

            proxyReq.on('error', (err) => {
                logger.error(`❌ Erro de conexão no stream: ${err.message}`);
                if (!res.headersSent) {
                    res.status(500).send(`Erro: ${err.message}`);
                }
            });

            proxyReq.on('timeout', () => {
                proxyReq.destroy();
                if (!res.headersSent) {
                    res.status(504).send('Timeout');
                }
            });

            // Limpar conexão quando cliente desconecta
            req.on('close', () => {
                if (!proxyReq.destroyed) {
                    proxyReq.destroy();
                }
            });

            proxyReq.end();
        };

        followRedirect(originalUrl);
    }

    /**
     * Limpar conexões inativas
     */
    async cleanupInactiveConnections() {
        try {
            const result = await database.query(`
                DELETE FROM active_connections 
                WHERE last_activity < DATE_SUB(NOW(), INTERVAL 30 MINUTE)
            `);
            
            if (result.affectedRows > 0) {
                logger.info(`🧹 ${result.affectedRows} conexões inativas removidas`);
            }
        } catch (error) {
            logger.error(`❌ Erro na limpeza de conexões: ${error.message}`);
        }
    }

    /**
     * Iniciar auto-update
     */
    startAutoUpdate() {
        logger.info(`🔄 Auto-update ativo: ${this.updateInterval / 1000 / 60} minutos`);
        
        setInterval(async () => {
            try {
                await this.loadFromXtreamAPI();
            } catch (error) {
                logger.error(`❌ Erro na atualização automática: ${error.message}`);
            }
        }, this.updateInterval);

        // Limpeza de conexões a cada 5 minutos
        setInterval(() => {
            this.cleanupInactiveConnections();
        }, 5 * 60 * 1000);
    }
}

module.exports = XtreamController;