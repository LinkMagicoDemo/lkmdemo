require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

// DEBUG: Verificar se o arquivo de banco de dados existe (ajuda no deploy Render)
const dbInitPath = path.join(__dirname, 'database', 'init.js');
console.log('🔍 Verificando caminho do DB:', dbInitPath);
if (!fs.existsSync(dbInitPath)) {
    console.error('❌ ERRO CRÍTICO: Pasta "database" ou arquivo "init.js" não encontrado!');
    console.log('Arquivos no diretório raiz:', fs.readdirSync(__dirname));
}

const { initializeDatabase } = require(dbInitPath);

// Inicializar DB
initializeDatabase();

const app = express();
const PORT = process.env.PORT || 3000;

// ===== SEGURANÇA =====
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"]
        }
    }
}));
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting global
app.use(rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 60,
    message: { error: 'Muitas requisições. Aguarde um momento.' }
}));

// Rate limiting para geração de links
app.use('/api/generate', rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 5,
    message: { error: 'Limite de gerações atingido. Aguarde 5 minutos.' }
}));

// ===== ROTAS ESTÁTICAS =====
app.use(express.static(path.join(__dirname, 'public')));

// ===== ROTAS API =====
const apiRoutes = require('./routes/api');
app.use('/api', apiRoutes);

// ===== ROTA /criar-link =====
app.get('/criar-link', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'criar-link.html'));
});

// ===== ROTA /demo/:id =====
app.get('/demo/:id', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'demo.html'));
});

// ===== HEALTH CHECK =====
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ===== 404 =====
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===== START =====
app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════╗
║  🔗 LinkMágico Demo — Servidor Ativo    ║
║  📍 http://localhost:${PORT}               ║
║  🧠 Groq → OpenRouter → OpenAI          ║
╚══════════════════════════════════════════╝
    `);
});
