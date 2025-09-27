const logger = require('./logger');

class SessionManager {
    constructor() {
        this.sessions = new Map();
        this.tempTokens = new Map();
        this.cleanupInterval = null;
        this.startCleanup();
    }

    /**
     * Criar sessão para usuário
     */
    createSession(user) {
        const sessionToken = `session_${user.id}_${Date.now().toString(36)}`;
        const sessionInfo = {
            token: sessionToken,
            userId: user.id,
            username: user.username,
            expires: Date.now() + (24 * 60 * 60 * 1000), // 24 horas
            created: Date.now()
        };

        this.sessions.set(user.username, sessionInfo);
        logger.info(`Sessão criada para usuário: ${user.username}`);
        
        return sessionToken;
    }

    /**
     * Obter sessão válida
     */
    getSession(username) {
        const session = this.sessions.get(username);
        
        if (session && session.expires > Date.now()) {
            return session;
        }
        
        // Remover sessão expirada
        if (session) {
            this.sessions.delete(username);
            logger.info(`Sessão expirada removida: ${username}`);
        }
        
        return null;
    }

    /**
     * Validar token de sessão
     */
    validateSessionToken(username, token) {
        const session = this.getSession(username);
        return session && session.token === token;
    }

    /**
     * Remover sessão
     */
    removeSession(username) {
        if (this.sessions.has(username)) {
            this.sessions.delete(username);
            logger.info(`Sessão removida: ${username}`);
            return true;
        }
        return false;
    }

    /**
     * Criar token temporário
     */
    createTempToken(username, duration = 60000) { // 1 minuto por padrão
        const token = `temp_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
        const tokenInfo = {
            token,
            username,
            expires: Date.now() + duration,
            created: Date.now()
        };

        this.tempTokens.set(username, token);
        logger.info(`Token temporário criado para: ${username}`);
        
        // Auto-remover após expirar
        setTimeout(() => {
            this.tempTokens.delete(username);
        }, duration);

        return token;
    }

    /**
     * Validar token temporário
     */
    validateTempToken(username, token) {
        const storedToken = this.tempTokens.get(username);
        return storedToken === token;
    }

    /**
     * Obter estatísticas das sessões
     */
    getStats() {
        const now = Date.now();
        const activeSessions = Array.from(this.sessions.values())
            .filter(session => session.expires > now);

        return {
            total_sessions: this.sessions.size,
            active_sessions: activeSessions.length,
            temp_tokens: this.tempTokens.size,
            oldest_session: activeSessions.length > 0 ? 
                Math.min(...activeSessions.map(s => s.created)) : null
        };
    }

    /**
     * Limpeza automática de sessões expiradas
     */
    startCleanup() {
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, 5 * 60 * 1000); // A cada 5 minutos

        logger.info('Limpeza automática de sessões iniciada');
    }

    /**
     * Executar limpeza
     */
    cleanup() {
        const now = Date.now();
        let removedCount = 0;

        // Limpar sessões expiradas
        for (const [username, session] of this.sessions.entries()) {
            if (session.expires <= now) {
                this.sessions.delete(username);
                removedCount++;
            }
        }

        if (removedCount > 0) {
            logger.info(`Limpeza de sessões: ${removedCount} sessões expiradas removidas`);
        }
    }

    /**
     * Parar limpeza automática
     */
    stopCleanup() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
            logger.info('Limpeza automática de sessões parada');
        }
    }
}

// Singleton
const sessionManager = new SessionManager();

// Disponibilizar globalmente para compatibilidade
global.userSessions = sessionManager.sessions;
global.tempTokens = sessionManager.tempTokens;

module.exports = sessionManager;