require('dotenv').config();
const database = require('../config/database');
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const logger = require('../utils/logger');

async function setupDatabase() {
    try {
        logger.info('🚀 Iniciando configuração do banco de dados...');
        
        // Criar tabelas
        await database.createTables();
        
        // Verificar se já existe admin
        const existingAdmin = await database.query(
            'SELECT * FROM users WHERE is_admin = TRUE LIMIT 1'
        );
        
        if (existingAdmin.length === 0) {
            logger.info('👤 Criando usuário administrador padrão...');
            
            // Criar admin padrão
            const adminData = {
                username: 'jean',
                password: '267589',
                display_name: 'Administrador Principal',
                user_type: 'admin',
                status: 'active',
                expires_at: new Date(Date.now() + (365 * 24 * 60 * 60 * 1000)), // 1 ano
                max_connections: 999,
                is_admin: true,
                notes: 'Usuário administrador criado automaticamente'
            };
            
            const hashedPassword = await bcrypt.hash(adminData.password, 12);
            
            await database.query(`
                INSERT INTO users (
                    username, password, display_name, user_type, status,
                    expires_at, max_connections, is_admin, notes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                adminData.username,
                hashedPassword,
                adminData.display_name,
                adminData.user_type,
                adminData.status,
                adminData.expires_at,
                adminData.max_connections,
                adminData.is_admin,
                adminData.notes
            ]);
            
            logger.info('✅ Admin criado com sucesso!');
            logger.info(`📋 Username: ${adminData.username}`);
            logger.info(`🔑 Password: ${adminData.password}`);
            logger.info('⚠️ ALTERE A SENHA DO ADMIN APÓS O PRIMEIRO LOGIN!');
        } else {
            logger.info('👤 Admin já existe no sistema');
        }
        
        // Configurações iniciais do sistema
        const defaultConfigs = [
            {
                key: 'system_version',
                value: '2.0.0',
                description: 'Versão atual do sistema'
            },
            {
                key: 'max_connections_per_user',
                value: '5',
                description: 'Máximo de conexões simultâneas por usuário'
            },
            {
                key: 'default_user_validity_days',
                value: '30',
                description: 'Validade padrão para novos usuários (em dias)'
            },
            {
                key: 'test_user_validity_hours',
                value: '24',
                description: 'Validade para usuários de teste (em horas)'
            }
        ];
        
        for (const config of defaultConfigs) {
            await database.query(`
                INSERT INTO system_config (config_key, config_value, description)
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE 
                config_value = VALUES(config_value),
                description = VALUES(description)
            `, [config.key, config.value, config.description]);
        }
        
        logger.info('✅ Configurações do sistema aplicadas');
        logger.info('🎉 Configuração concluída com sucesso!');
        
    } catch (error) {
        logger.error(`❌ Erro na configuração: ${error.message}`);
        process.exit(1);
    } finally {
        await database.close();
        process.exit(0);
    }
}

// Executar setup
if (require.main === module) {
    setupDatabase();
}

module.exports = { setupDatabase };