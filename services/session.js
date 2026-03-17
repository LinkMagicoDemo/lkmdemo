const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/init');

const MAX_MESSAGES = parseInt(process.env.DEMO_MAX_MESSAGES || '20');
const EXPIRY_MINUTES = parseInt(process.env.DEMO_EXPIRY_MINUTES || '30');

function createSession(url, pageData, ip) {
    const db = getDb();

    const MAX_LINKS_PER_IP = parseInt(process.env.DEMO_MAX_LINKS_PER_IP || '5');

    // Verificar limite de links por IP
    const activeByIp = db.prepare(
        `SELECT COUNT(*) as count FROM sessions WHERE ip = ? AND status = 'active' AND expires_at > datetime('now')`
    ).get(ip || '');

    if (activeByIp && activeByIp.count >= MAX_LINKS_PER_IP) {
        return { error: 'LIMIT_REACHED', message: 'Você atingiu o limite de demonstrações simultâneas. Aguarde uma expirar ou ative o LinkMágico completo.' };
    }

    const id = uuidv4().substring(0, 8);
    const expiresAt = new Date(Date.now() + EXPIRY_MINUTES * 60 * 1000).toISOString();

    db.prepare(`
        INSERT INTO sessions (id, url, page_data, ip, expires_at)
        VALUES (?, ?, ?, ?, ?)
    `).run(id, url, JSON.stringify(pageData), ip || '', expiresAt);

    console.log(`✅ Sessão criada: ${id} (expira em ${EXPIRY_MINUTES}min)`);

    return {
        id,
        url,
        title: pageData.title,
        expiresAt,
        maxMessages: MAX_MESSAGES,
        expiryMinutes: EXPIRY_MINUTES
    };
}

function getSession(id) {
    const db = getDb();
    const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
    if (!row) return null;

    return {
        ...row,
        page_data: JSON.parse(row.page_data || '{}'),
        history: JSON.parse(row.history || '[]')
    };
}

function isSessionValid(id) {
    const session = getSession(id);
    if (!session) return { valid: false, reason: 'NOT_FOUND' };
    if (session.status !== 'active') return { valid: false, reason: 'EXPIRED' };
    if (new Date(session.expires_at) < new Date()) return { valid: false, reason: 'EXPIRED' };
    if (session.message_count >= MAX_MESSAGES) return { valid: false, reason: 'MSG_LIMIT' };
    return { valid: true, session };
}

function addMessage(id, role, content) {
    const db = getDb();
    const session = getSession(id);
    if (!session) return null;

    const history = session.history || [];
    history.push({ role, content });

    // Manter apenas últimas 20 mensagens no histórico
    const trimmed = history.slice(-20);

    if (role === 'user') {
        db.prepare(`
            UPDATE sessions SET history = ?, message_count = message_count + 1 WHERE id = ?
        `).run(JSON.stringify(trimmed), id);
    } else {
        db.prepare(`
            UPDATE sessions SET history = ? WHERE id = ?
        `).run(JSON.stringify(trimmed), id);
    }

    return { messageCount: session.message_count + (role === 'user' ? 1 : 0), maxMessages: MAX_MESSAGES };
}

function getSessionStats(id) {
    const session = getSession(id);
    if (!session) return null;

    const elapsed = Date.now() - new Date(session.created_at).getTime();
    const remaining = Math.max(0, new Date(session.expires_at).getTime() - Date.now());

    return {
        messageCount: session.message_count,
        maxMessages: MAX_MESSAGES,
        elapsedMs: elapsed,
        remainingMs: remaining,
        remainingMinutes: Math.ceil(remaining / 60000),
        isExpired: remaining <= 0 || session.message_count >= MAX_MESSAGES
    };
}

module.exports = { createSession, getSession, isSessionValid, addMessage, getSessionStats };
