const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'demo.db');

let db;

function initializeDatabase() {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            url TEXT NOT NULL,
            page_data TEXT NOT NULL,
            history TEXT DEFAULT '[]',
            message_count INTEGER DEFAULT 0,
            ip TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME NOT NULL,
            status TEXT DEFAULT 'active'
        );

        CREATE INDEX IF NOT EXISTS idx_sessions_ip ON sessions(ip);
        CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
        CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
    `);

    // Limpar sessões expiradas a cada 5 minutos
    setInterval(() => {
        try {
            db.prepare(`UPDATE sessions SET status = 'expired' WHERE expires_at < datetime('now') AND status = 'active'`).run();
        } catch (e) { /* silent */ }
    }, 5 * 60 * 1000);

    console.log('✅ Database SQLite inicializado');
    return db;
}

function getDb() {
    if (!db) initializeDatabase();
    return db;
}

module.exports = { initializeDatabase, getDb };
