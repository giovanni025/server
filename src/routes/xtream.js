const express = require('express');
const AuthMiddleware = require('../middleware/auth');
const XtreamController = require('../controllers/XtreamController');

const router = express.Router();
const xtreamController = new XtreamController();

// Middleware personalizado para autenticação de rotas de stream
const authenticateStream = async (req, res, next) => {
    try {
        const { username, password } = req.params;

        if (!username || !password) {
            return res.status(401).send('Credenciais obrigatórias');
        }

        // Simular query params para usar o middleware de autenticação
        req.query = { username, password };
        
        // Usar o middleware de autenticação existente
        await AuthMiddleware.authenticateUser(req, res, next);
    } catch (error) {
        console.error('Erro na autenticação de stream:', error);
        res.status(401).send('Falha na autenticação');
    }
};

// API principal do Xtream (COM autenticação)
router.get('/player_api.php', AuthMiddleware.authenticateUser, xtreamController.handlePlayerAPI.bind(xtreamController));

// API alternativa (SEM autenticação prévia - ela mesma faz a autenticação)
router.get('/api.php', xtreamController.handleAlternativeAPI.bind(xtreamController));
router.post('/api.php', xtreamController.handleAlternativeAPI.bind(xtreamController));

// Rotas com prefixo /api/
router.get('/api/player_api.php', AuthMiddleware.authenticateUser, xtreamController.handlePlayerAPI.bind(xtreamController));

// Live TV streams (COM autenticação)
router.get('/live/:username/:password/:streamId.:extension', authenticateStream, async (req, res) => {
    const { streamId, extension } = req.params;
    const stream = xtreamController.liveStreams.get(streamId);
    
    if (!stream) {
        return res.status(404).send('Canal não encontrado');
    }
    
    const originalUrl = `${process.env.ORIGINAL_API_URL}/live/${process.env.ORIGINAL_USERNAME}/${process.env.ORIGINAL_PASSWORD}/${streamId}.${extension}`;
    await xtreamController.proxyStream(originalUrl, req, res, req.user, stream.name);
});

router.get('/live/:username/:password/:streamId', authenticateStream, async (req, res) => {
    const { streamId } = req.params;
    const stream = xtreamController.liveStreams.get(streamId);
    
    if (!stream) {
        return res.status(404).send('Canal não encontrado');
    }
    
    const originalUrl = `${process.env.ORIGINAL_API_URL}/live/${process.env.ORIGINAL_USERNAME}/${process.env.ORIGINAL_PASSWORD}/${streamId}.ts`;
    await xtreamController.proxyStream(originalUrl, req, res, req.user, stream.name);
});

// Movie streams (COM autenticação)
router.get('/movie/:username/:password/:streamId.:extension', authenticateStream, async (req, res) => {
    const { streamId, extension } = req.params;
    const stream = xtreamController.vodStreams.get(streamId);
    
    if (!stream) {
        return res.status(404).send('Filme não encontrado');
    }
    
    const originalUrl = `${process.env.ORIGINAL_API_URL}/movie/${process.env.ORIGINAL_USERNAME}/${process.env.ORIGINAL_PASSWORD}/${streamId}.${extension}`;
    await xtreamController.proxyStream(originalUrl, req, res, req.user, stream.name);
});

router.get('/movie/:username/:password/:streamId', authenticateStream, async (req, res) => {
    const { streamId } = req.params;
    const stream = xtreamController.vodStreams.get(streamId);
    
    if (!stream) {
        return res.status(404).send('Filme não encontrado');
    }
    
    const extension = stream.container_extension || 'mp4';
    const originalUrl = `${process.env.ORIGINAL_API_URL}/movie/${process.env.ORIGINAL_USERNAME}/${process.env.ORIGINAL_PASSWORD}/${streamId}.${extension}`;
    await xtreamController.proxyStream(originalUrl, req, res, req.user, stream.name);
});

// Series streams (COM autenticação)
router.get('/series/:username/:password/:seriesId/:seasonId/:episodeId.:extension', authenticateStream, async (req, res) => {
    const { seriesId, seasonId, episodeId, extension } = req.params;
    const originalUrl = `${process.env.ORIGINAL_API_URL}/series/${process.env.ORIGINAL_USERNAME}/${process.env.ORIGINAL_PASSWORD}/${seriesId}/${seasonId}/${episodeId}.${extension}`;
    await xtreamController.proxyStream(originalUrl, req, res, req.user, `Serie_${seriesId}_S${seasonId}_E${episodeId}`);
});

router.get('/series/:username/:password/:episodeId.:extension', authenticateStream, async (req, res) => {
    const { episodeId, extension } = req.params;
    const originalUrl = `${process.env.ORIGINAL_API_URL}/series/${process.env.ORIGINAL_USERNAME}/${process.env.ORIGINAL_PASSWORD}/${episodeId}.${extension}`;
    await xtreamController.proxyStream(originalUrl, req, res, req.user, `Episode_${episodeId}`);
});

// XMLtv (COM autenticação)
router.get('/xmltv.php', AuthMiddleware.authenticateUser, (req, res) => {
    res.setHeader('Content-Type', 'application/xml');
    res.send('<?xml version="1.0" encoding="UTF-8"?>\n<tv></tv>');
});

// Inicializar dados
xtreamController.loadFromXtreamAPI().then(() => {
    xtreamController.startAutoUpdate();
}).catch(err => {
    console.error('Erro ao carregar dados iniciais:', err.message);
});

module.exports = router;