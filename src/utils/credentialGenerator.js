const crypto = require('crypto');

class CredentialGenerator {
    /**
     * Gera username no formato 3 letras + 4 números
     * Exemplo: ABC1234
     */
    static generateUsername() {
        const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const numbers = '0123456789';
        
        let username = '';
        
        // 3 letras
        for (let i = 0; i < 3; i++) {
            username += letters.charAt(Math.floor(Math.random() * letters.length));
        }
        
        // 4 números
        for (let i = 0; i < 4; i++) {
            username += numbers.charAt(Math.floor(Math.random() * numbers.length));
        }
        
        return username;
    }

    /**
     * Gera password segura
     */
    static generatePassword(length = 12) {
        const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*';
        let password = '';
        
        for (let i = 0; i < length; i++) {
            password += charset.charAt(Math.floor(Math.random() * charset.length));
        }
        
        return password;
    }

    /**
     * Gera ID único para conexão
     */
    static generateConnectionId() {
        return crypto.randomBytes(16).toString('hex');
    }

    /**
     * Calcula data de expiração
     */
    static calculateExpirationDate(type, customDays = null) {
        const now = new Date();
        
        switch (type) {
            case 'test':
                // 24 horas para teste
                return new Date(now.getTime() + (24 * 60 * 60 * 1000));
            
            case 'monthly':
                // 30 dias para mensal
                return new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000));
            
            case 'custom':
                // Dias customizados
                const days = customDays || 30;
                return new Date(now.getTime() + (days * 24 * 60 * 60 * 1000));
            
            default:
                return new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000));
        }
    }

    /**
     * Verifica se username já existe no formato esperado
     */
    static isValidUsernameFormat(username) {
        const pattern = /^[A-Z]{3}[0-9]{4}$/;
        return pattern.test(username);
    }
}

module.exports = CredentialGenerator;