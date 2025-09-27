const express = require('express');
const AdminController = require('../controllers/AdminController');
const AuthMiddleware = require('../middleware/auth');

const router = express.Router();

/**
 * @swagger
 * /admin/login:
 *   post:
 *     tags: [Admin]
 *     summary: Login de administrador
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login realizado com sucesso
 */
router.post('/login', AdminController.login);

// Middleware para proteger rotas admin
router.use(AuthMiddleware.authenticateAdmin);

/**
 * @swagger
 * /admin/users:
 *   post:
 *     tags: [Admin]
 *     summary: Criar novo usuário
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               user_type:
 *                 type: string
 *                 enum: [test, monthly]
 *               validity_days:
 *                 type: integer
 *               max_connections:
 *                 type: integer
 *                 default: 5
 *               display_name:
 *                 type: string
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Usuário criado com sucesso
 */
router.post('/users', AdminController.createUser);

/**
 * @swagger
 * /admin/users:
 *   get:
 *     tags: [Admin]
 *     summary: Listar usuários
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, suspended, expired]
 *       - in: query
 *         name: user_type
 *         schema:
 *           type: string
 *           enum: [test, monthly]
 *       - in: query
 *         name: expired
 *         schema:
 *           type: string
 *           enum: [yes, no]
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Lista de usuários
 */
router.get('/users', AdminController.listUsers);

/**
 * @swagger
 * /admin/users/{userId}:
 *   get:
 *     tags: [Admin]
 *     summary: Obter detalhes do usuário
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Detalhes do usuário
 */
router.get('/users/:userId', AdminController.getUser);

/**
 * @swagger
 * /admin/users/{userId}/renew:
 *   post:
 *     tags: [Admin]
 *     summary: Renovar usuário
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               additional_days:
 *                 type: integer
 *                 default: 30
 *     responses:
 *       200:
 *         description: Usuário renovado com sucesso
 */
router.post('/users/:userId/renew', AdminController.renewUser);

/**
 * @swagger
 * /admin/users/{userId}/status:
 *   put:
 *     tags: [Admin]
 *     summary: Atualizar status do usuário
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [active, suspended, expired]
 *     responses:
 *       200:
 *         description: Status atualizado com sucesso
 */
router.put('/users/:userId/status', AdminController.updateUserStatus);

/**
 * @swagger
 * /admin/users/{userId}:
 *   delete:
 *     tags: [Admin]
 *     summary: Deletar usuário
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Usuário deletado com sucesso
 */
router.delete('/users/:userId', AdminController.deleteUser);

/**
 * @swagger
 * /admin/statistics:
 *   get:
 *     tags: [Admin]
 *     summary: Estatísticas do sistema
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Estatísticas detalhadas
 */
router.get('/statistics', AdminController.getStatistics);

/**
 * @swagger
 * /admin/logs:
 *   get:
 *     tags: [Admin]
 *     summary: Logs do sistema
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *       - in: query
 *         name: user_id
 *         schema:
 *           type: integer
 *       - in: query
 *         name: status_code
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Lista de logs
 */
router.get('/logs', AdminController.getLogs);

/**
 * @swagger
 * /admin/cleanup:
 *   post:
 *     tags: [Admin]
 *     summary: Limpar usuários expirados
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Limpeza executada com sucesso
 */
router.post('/cleanup', AdminController.cleanupExpiredUsers);

module.exports = router;