require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const os = require('os');

const database = require('./config/database');
const User = require('./models/User');
const AuthMiddleware = require('./middleware/auth');
const adminRoutes = require('./routes/admin');
const xtreamRoutes = require('./routes/xtream');
const logger = require('./utils/logger');
const sessionManager = require('./utils/sessionManager');

class XtreamRedistributor {
    constructor() {
        this.app = express();
        this.host = process.env.HOST || '0.0.0.0';
        this.port = process.env.PORT || 3000;
        this.externalIP = this.getExternalIP();
        
        this.setupMiddleware();
        this.setupSwagger();
        this.setupRoutes();
        this.setupCronJobs();
        this.setupErrorHandling();
    }

    getExternalIP() {
        const interfaces = os.networkInterfaces();
        let externalIP = 'localhost';
        
        // Procurar por interface de rede externa (não loopback)
        for (const interfaceName in interfaces) {
            const networkInterface = interfaces[interfaceName];
            for (const network of networkInterface) {
                // Pegar IPv4 que não seja interno (127.x.x.x)
                if (network.family === 'IPv4' && !network.internal) {
                    externalIP = network.address;
                    break;
                }
            }
            if (externalIP !== 'localhost') break;
        }
        
        return externalIP;
    }

    setupMiddleware() {
        // Segurança
        this.app.use(helmet({
            contentSecurityPolicy: false // Para permitir Swagger UI
        }));
        
        // CORS
        this.app.use(cors({
            origin: '*',
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'Range'],
            exposedHeaders: ['Content-Range', 'Content-Length', 'Accept-Ranges']
        }));
        
        // Trust proxy configurado corretamente
        this.app.set('trust proxy', ['127.0.0.1', '::1']);
        
        // Rate limiting com configuração específica para proxy
        const limiter = rateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutos
            max: 1000, // Limite de 1000 requests por IP
            message: {
                error: 'Rate limit excedido',
                message: 'Muitas requisições. Tente novamente em 15 minutos.'
            },
            standardHeaders: true,
            legacyHeaders: false,
            // Usar IP real ao invés de confiar em qualquer proxy
            keyGenerator: (req) => {
                return req.ip || req.connection.remoteAddress || 'unknown';
            }
        });
        this.app.use(limiter);
        
        // Body parsing
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
        
        // Log de acesso
        this.app.use(AuthMiddleware.logAccess);
        
        // Headers personalizados
        this.app.use((req, res, next) => {
            res.header('X-Powered-By', 'Xtream Redistributor v2.0');
            res.header('Server', 'Xtream/2.0');
            next();
        });
    }

    setupSwagger() {
        const options = {
            definition: {
                openapi: '3.0.0',
                info: {
                    title: 'Xtream Redistributor API',
                    version: '2.0.0',
                    description: 'API Profissional para Redistribuição Xtream Codes com Autenticação Real',
                    contact: {
                        name: 'API Support',
                        email: 'support@example.com'
                    }
                },
                servers: [
                    {
                        url: `http://${this.externalIP}:${this.port}`,
                        description: 'Servidor Principal (IP Externo)'
                    },
                    {
                        url: `http://localhost:${this.port}`,
                        description: 'Servidor Local'
                    }
                ],
                components: {
                    securitySchemes: {
                        bearerAuth: {
                            type: 'http',
                            scheme: 'bearer',
                            bearerFormat: 'JWT'
                        }
                    }
                }
            },
            apis: ['./src/routes/*.js', './src/controllers/*.js']
        };

        const specs = swaggerJsdoc(options);
        this.app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs, {
            customCss: '.swagger-ui .topbar { display: none }',
            customSiteTitle: 'Xtream API Documentation'
        }));
    }

    setupRoutes() {
        // Rota de status do sistema
        this.app.get('/', (req, res) => {
            res.json({
                service: 'Xtream Codes API Redistributor',
                version: '2.0.0',
                status: 'Online',
                uptime: process.uptime(),
                timestamp: new Date().toISOString(),
                server_info: {
                    external_ip: this.externalIP,
                    internal_host: this.host,
                    port: this.port,
                    external_url: `http://${this.externalIP}:${this.port}`,
                    local_url: `http://localhost:${this.port}`
                },
                endpoints: {
                    admin_api: '/admin',
                    player_api: '/player_api.php',
                    alternative_api: '/api.php',
                    documentation: '/api-docs',
                    health_check: '/health'
                },
                features: [
                    'Autenticação JWT para admins',
                    'Autenticação de usuários com MySQL',
                    'Sistema de expiração automática',
                    'Controle de conexões simultâneas',
                    'Logs detalhados de acesso',
                    'API REST completa para gerenciamento'
                ]
            });
        });

        // Health check
        this.app.get('/health', async (req, res) => {
            try {
                // Testar banco de dados
                await database.query('SELECT 1');
                
                res.json({
                    status: 'healthy',
                    timestamp: new Date().toISOString(),
                    server_info: {
                        external_ip: this.externalIP,
                        port: this.port
                    },
                    services: {
                        database: 'connected',
                        api: 'operational'
                    },
                    uptime: process.uptime()
                });
            } catch (error) {
                res.status(503).json({
                    status: 'unhealthy',
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        });

        // Rotas da API
        this.app.use('/admin', adminRoutes);
        this.app.use('/', xtreamRoutes);
        
        // Rota 404
        this.app.use('*', (req, res) => {
            res.status(404).json({
                error: 'Endpoint não encontrado',
                path: req.originalUrl,
                method: req.method,
                server_info: {
                    external_url: `http://${this.externalIP}:${this.port}`,
                    local_url: `http://localhost:${this.port}`
                },
                available_endpoints: [
                    'GET /',
                    'GET /health',
                    'GET /api-docs',
                    'POST /admin/login',
                    'GET /player_api.php',
                    'GET /api.php'
                ]
            });
        });
    }

    setupCronJobs() {
        // Limpeza de usuários expirados - todos os dias às 2:00
        cron.schedule('0 2 * * *', async () => {
            logger.info('Executando limpeza automática de usuários expirados...');
            try {
                await User.cleanupExpired();
                logger.info('Limpeza automática concluída');
            } catch (error) {
                logger.error(`Erro na limpeza automática: ${error.message}`);
            }
        });

        // Limpeza de conexões inativas - a cada 5 minutos
        cron.schedule('*/5 * * * *', async () => {
            try {
                const result = await database.query(`
                    DELETE FROM active_connections 
                    WHERE last_activity < DATE_SUB(NOW(), INTERVAL 30 MINUTE)
                `);
                
                if (result.affectedRows > 0) {
                    logger.info(`${result.affectedRows} conexões inativas removidas`);
                }
            } catch (error) {
                logger.error(`Erro na limpeza de conexões: ${error.message}`);
            }
        });

        // Backup do banco de dados - todos os dias às 3:00
        cron.schedule('0 3 * * *', () => {
            this.createDatabaseBackup();
        });
    }

    async createDatabaseBackup() {
        try {
            const backupDir = path.join(__dirname, '../backups');
            if (!fs.existsSync(backupDir)) {
                fs.mkdirSync(backupDir, { recursive: true });
            }

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupFile = path.join(backupDir, `backup_${timestamp}.sql`);

            // Comando mysqldump (requer mysqldump instalado)
            const { spawn } = require('child_process');
            
            const mysqldump = spawn('mysqldump', [
                '-h', process.env.DB_HOST || 'localhost',
                '-P', process.env.DB_PORT || '3306',
                '-u', process.env.DB_USER || 'root',
                ...(process.env.DB_PASSWORD ? ['-p' + process.env.DB_PASSWORD] : []),
                process.env.DB_NAME || 'xtream_users'
            ]);

            const writeStream = fs.createWriteStream(backupFile);
            mysqldump.stdout.pipe(writeStream);

            mysqldump.on('close', (code) => {
                if (code === 0) {
                    logger.info(`Backup criado: ${backupFile}`);
                    
                    // Manter apenas os últimos 7 backups
                    const backupFiles = fs.readdirSync(backupDir)
                        .filter(file => file.startsWith('backup_'))
                        .sort()
                        .reverse();
                    
                    if (backupFiles.length > 7) {
                        const filesToDelete = backupFiles.slice(7);
                        filesToDelete.forEach(file => {
                            fs.unlinkSync(path.join(backupDir, file));
                            logger.info(`Backup antigo removido: ${file}`);
                        });
                    }
                } else {
                    logger.error(`Erro no backup (código ${code})`);
                }
            });

        } catch (error) {
            logger.error(`Erro ao criar backup: ${error.message}`);
        }
    }

    setupErrorHandling() {
        // Handler para erros não capturados
        process.on('uncaughtException', (error) => {
            logger.error(`Uncaught Exception: ${error.message}`, { stack: error.stack });
            process.exit(1);
        });

        process.on('unhandledRejection', (reason, promise) => {
            logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
        });

        // Graceful shutdown
        process.on('SIGTERM', async () => {
            logger.info('SIGTERM recebido. Encerrando graciosamente...');
            await database.close();
            process.exit(0);
        });

        process.on('SIGINT', async () => {
            logger.info('SIGINT recebido. Encerrando graciosamente...');
            await database.close();
            process.exit(0);
        });
    }

    async start() {
        try {
            // Criar diretório de logs
            const logsDir = path.join(__dirname, '../logs');
            if (!fs.existsSync(logsDir)) {
                fs.mkdirSync(logsDir, { recursive: true });
            }

            // Inicializar banco de dados
            await database.createTables();
            logger.info('Banco de dados inicializado');

            // Verificar configurações essenciais
            if (!process.env.ORIGINAL_API_URL || !process.env.ORIGINAL_USERNAME) {
                logger.warn('Credenciais da API original não configuradas');
            }

            this.app.listen(this.port, this.host, () => {
                logger.info('\n' + '='.repeat(70));
                logger.info('XTREAM CODES API REDISTRIBUTOR v2.0');
                logger.info('='.repeat(70));
                logger.info(`Servidor ativo em ${this.host}:${this.port}`);
                logger.info(`IP Externo: ${this.externalIP}`);
                logger.info(`URL Externa: http://${this.externalIP}:${this.port}`);
                logger.info(`URL Local: http://localhost:${this.port}`);
                logger.info(`Documentação: http://${this.externalIP}:${this.port}/api-docs`);
                logger.info(`Admin Login: POST http://${this.externalIP}:${this.port}/admin/login`);
                logger.info(`Player API: GET http://${this.externalIP}:${this.port}/player_api.php`);
                logger.info('='.repeat(70));
                logger.info('Sistema inicializado e pronto para uso!');
                logger.info(`Acesse externamente: http://${this.externalIP}:${this.port}`);
                logger.info('='.repeat(70));
            });

        } catch (error) {
            logger.error(`Erro ao iniciar servidor: ${error.message}`);
            process.exit(1);
        }
    }
}

// Criar e iniciar a aplicação
const app = new XtreamRedistributor();
app.start();

module.exports = XtreamRedistributor;