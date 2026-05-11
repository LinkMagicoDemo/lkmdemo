const express = require('express');
const router = express.Router();
const { extractPageData } = require('../services/scraper');
const { generateResponse, generateOpeningMessage } = require('../services/ai');
const { createSession, isSessionValid, addMessage, getSessionStats, getSession } = require('../services/session');

// ===== POST /api/generate =====
// Recebe URL, extrai conteúdo, cria sessão demo
router.post('/generate', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: 'URL é obrigatória' });

        // Validar URL
        try { new URL(url); } catch { return res.status(400).json({ error: 'URL inválida' }); }

        console.log(`🔗 Gerando demo para: ${url}`);

        // Extrair conteúdo da página
        const pageData = await extractPageData(url);

        if (!pageData.title && !pageData.cleanText) {
            return res.status(422).json({ error: 'Não foi possível extrair conteúdo desta página. Tente outra URL.' });
        }

        // Log de qualidade da extração
        console.log(`📊 Extração: título="${pageData.title}", desc=${pageData.description?.length || 0} chars, texto=${pageData.cleanText?.length || 0} chars, preços=${pageData.prices?.length || 0}`);

        // Criar sessão demo
        const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip || '';
        const session = createSession(url, pageData, ip);

        if (session.error) {
            return res.status(429).json({
                error: session.message,
                code: session.error,
                hotmartLink: process.env.HOTMART_LINK
            });
        }

        // Gerar mensagem de abertura contextual
        const opening = generateOpeningMessage(pageData);

        res.json({
            success: true,
            session: {
                id: session.id,
                url: session.url,
                title: session.title,
                demoLink: `/demo/${session.id}`,
                expiresAt: session.expiresAt,
                maxMessages: session.maxMessages,
                expiryMinutes: session.expiryMinutes
            }
        });

    } catch (err) {
        console.error('❌ Erro ao gerar demo:', err.message);
        res.status(500).json({ error: err.message || 'Erro interno' });
    }
});

// ===== GET /api/session/:id =====
// Retorna dados e status da sessão + abertura contextual
router.get('/session/:id', (req, res) => {
    try {
        const { id } = req.params;
        const check = isSessionValid(id);

        if (!check.valid) {
            return res.status(check.reason === 'NOT_FOUND' ? 404 : 410).json({
                error: check.reason === 'NOT_FOUND' ? 'Demonstração não encontrada' : 'Demonstração expirada',
                code: check.reason,
                hotmartLink: process.env.HOTMART_LINK
            });
        }

        const stats = getSessionStats(id);
        const pageData = check.session.page_data || {};

        // Gerar abertura contextual baseada no conteúdo da página
        const opening = generateOpeningMessage(pageData);

        // Extrair informações úteis para o frontend
        const pageInfo = {
            title: pageData.title || '',
            description: (pageData.description || '').substring(0, 200),
            prices: pageData.prices || [],
            cta: pageData.cta || '',
            hasWhatsapp: (pageData.contacts?.whatsapp?.length || 0) > 0,
            hasEmail: (pageData.contacts?.email?.length || 0) > 0,
            contentLength: (pageData.cleanText || '').length
        };

        res.json({
            success: true,
            session: {
                id,
                title: pageData.title,
                url: check.session.url,
                ...stats
            },
            opening,
            pageInfo,
            hotmartLink: process.env.HOTMART_LINK || 'https://pay.hotmart.com/G103177435I'
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===== POST /api/chat/:id =====
// Recebe mensagem, retorna resposta IA
router.post('/chat/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { message } = req.body;

        if (!message || !String(message).trim()) {
            return res.status(400).json({ error: 'Mensagem é obrigatória' });
        }

        // Validar sessão
        const check = isSessionValid(id);
        if (!check.valid) {
            const isLimit = check.reason === 'MSG_LIMIT';
            return res.status(410).json({
                error: isLimit
                    ? 'Este teste atingiu o limite de demonstração. Para usar com visitantes reais e ilimitados, ative seu LinkMágico completo.'
                    : 'Demonstração expirada. Ative o LinkMágico completo para uso ilimitado.',
                code: check.reason,
                hotmartLink: process.env.HOTMART_LINK,
                limitReached: true
            });
        }

        const session = check.session;

        // Salvar mensagem do usuário
        const msgStats = addMessage(id, 'user', String(message).trim());

        // Gerar resposta IA
        const result = await generateResponse(
            message,
            session.page_data,
            session.history,
            session.message_count + 1
        );

        // Salvar resposta IA
        addMessage(id, 'assistant', result.text);

        // Stats atualizadas
        const stats = getSessionStats(id);

        // Detectar URLs na resposta para gerar botões de link
        const urlPattern = /(https?:\/\/[^\s]+)/g;
        const detectedUrls = result.text.match(urlPattern) || [];
        const primaryLink = detectedUrls[0] || null;

        res.json({
            success: true,
            response: result.text,
            messages: result.messages || [result.text],
            provider: result.provider,
            emotion: result.emotion?.primary,
            stage: result.stage,
            linkType: result.linkType || 'generic',
            pressureLevel: result.pressureLevel || 1,
            checkoutLink: primaryLink,
            hotmartLink: process.env.HOTMART_LINK || 'https://pay.hotmart.com/G103177435I',
            stats: {
                messageCount: stats.messageCount,
                maxMessages: stats.maxMessages,
                remainingMinutes: stats.remainingMinutes,
                isNearLimit: stats.messageCount >= stats.maxMessages - 3
            }
        });

    } catch (err) {
        console.error('❌ Erro no chat:', err.message);
        res.status(500).json({ error: 'Erro ao gerar resposta. Tente novamente.' });
    }
});

module.exports = router;
