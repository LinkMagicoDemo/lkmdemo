const axios = require('axios');

// ===== CONFIGURAÇÃO DE PROVEDORES =====
const PROVIDERS = [
    {
        name: 'Groq',
        url: 'https://api.groq.com/openai/v1/chat/completions',
        keyEnv: 'GROQ_API_KEY',
        modelEnv: 'GROQ_MODEL',
        defaultModel: 'llama-3.3-70b-versatile',
        maxTokens: 1200
    },
    {
        name: 'OpenRouter',
        url: 'https://openrouter.ai/api/v1/chat/completions',
        keyEnv: 'OPENROUTER_API_KEY',
        modelEnv: 'OPENROUTER_MODEL',
        defaultModel: 'meta-llama/llama-3.3-70b-instruct',
        maxTokens: 1200,
        extraHeaders: { 'HTTP-Referer': 'https://linkmagico.ai', 'X-Title': 'LinkMagico Demo' }
    },
    {
        name: 'OpenAI',
        url: 'https://api.openai.com/v1/chat/completions',
        keyEnv: 'OPENAI_API_KEY',
        modelEnv: 'OPENAI_MODEL',
        defaultModel: 'gpt-4o-mini',
        maxTokens: 1200
    }
];

// ===== ANÁLISE DE EMOÇÕES =====
function analyzeEmotion(message) {
    const msg = message.toLowerCase();
    let primary = 'neutro';
    let secondary = null;
    let sarcasm = false;
    let urgency = false;
    let intentions = [];

    // Emoções
    if (/raiva|irritad|absurd|péssim|lixo|horrível|porcaria/i.test(msg)) primary = 'frustração';
    else if (/medo|receio|cuidado|perig|arrisca|confia/i.test(msg)) primary = 'insegurança';
    else if (/feliz|ótimo|maravilh|incríve|perfeito|amo|adore/i.test(msg)) primary = 'entusiasmo';
    else if (/triste|decepcion|frustr|chatea/i.test(msg)) primary = 'decepção';
    else if (/ansios|urgent|rápid|agora|preciso já/i.test(msg)) { primary = 'ansiedade'; urgency = true; }
    else if (/curios|como|funciona|explica|quero saber|entender/i.test(msg)) primary = 'curiosidade';
    else if (/duvid|será|serque|não sei|incert/i.test(msg)) primary = 'dúvida';

    // Sarcasmo
    if (/né\?|tá bom|sei|claro|imagina|aham/i.test(msg) && /!|\?{2,}/i.test(msg)) sarcasm = true;
    if (/nossa que|super |muito bom /i.test(msg) && msg.length < 30) sarcasm = true;

    // Urgência
    if (/urgent|agora|hoje|rápid|pressa|imediato/i.test(msg)) urgency = true;

    // Intenções múltiplas
    if (/preço|valor|custo|custa|quanto|investimento|parcela/i.test(msg)) intentions.push('preço');
    if (/funciona|como|usa|configura|faz/i.test(msg)) intentions.push('funcionamento');
    if (/garant|devolu|reembols|cancel|arrepend/i.test(msg)) intentions.push('garantia');
    if (/result|depoiment|prova|funciona mesmo|alguém/i.test(msg)) intentions.push('prova_social');
    if (/comprar|adquirir|assinar|ativar|quero|pegar/i.test(msg)) intentions.push('compra');
    if (/suport|ajuda|problema|erro|bug/i.test(msg)) intentions.push('suporte');
    if (/whatsapp|whats|zap|telefone|ligar|contato/i.test(msg)) intentions.push('contato');
    if (/bônus|brinde|extra|brindes/i.test(msg)) intentions.push('bonus');

    if (intentions.length === 0) intentions.push('informação_geral');

    return { primary, secondary, sarcasm, urgency, intentions };
}

// ===== ANÁLISE DE ESTÁGIO DE COMPRA =====
function analyzeJourneyStage(message) {
    const msg = message.toLowerCase();

    if (/comprar|adquirir|ativar|assinar|pegar|quero|fechar|link.*compra|checkout/i.test(msg)) return 'DECISÃO';
    if (/preço|valor|custo|parcela|desconto|promoção|oferta|plano/i.test(msg)) return 'NEGOCIAÇÃO';
    if (/funciona|como|usa|configura|resultado|depoimento|prova|garantia|suporte/i.test(msg)) return 'CONSIDERAÇÃO';
    return 'DESCOBERTA';
}

// ===== CONSTRUIR PROMPT SUPERINTELIGENTE =====
function buildSystemPrompt(pageData, emotion, stage, messageCount) {
    const contactInfo = [];
    if (pageData.contacts) {
        if (pageData.contacts.telefone?.length) contactInfo.push(`Telefones: ${pageData.contacts.telefone.join(', ')}`);
        if (pageData.contacts.whatsapp?.length) contactInfo.push(`WhatsApp: ${pageData.contacts.whatsapp.join(', ')}`);
        if (pageData.contacts.email?.length) contactInfo.push(`Emails: ${pageData.contacts.email.join(', ')}`);
        if (pageData.contacts.site?.length) contactInfo.push(`Site: ${pageData.contacts.site[0]}`);
    }

    const priceInfo = pageData.prices?.length ? `💰 PREÇOS DETECTADOS: ${pageData.prices.join(', ')}` : '';

    // Script de conversão v2 — CONDUÇÃO E FECHAMENTO
    let conversionScript = '';
    if (messageCount <= 1) {
        conversionScript = `FASE: ABERTURA GUIADA — Seja extremamente acolhedor. 
DIRETRIZ: Responda rápido e pergunte: "Você está buscando mais aumentar suas vendas ou automatizar seu atendimento primeiro?"`;
    } else if (messageCount <= 3) {
        conversionScript = `FASE: VALIDAÇÃO — Use Prova Contextual: "Pessoas em situação semelhante costumam ter bons resultados com isso."
Após explicar, pergunte: "Isso faz sentido pra você até aqui?"`;
    } else if (messageCount <= 6) {
        conversionScript = `FASE: PRÉ-FECHAMENTO — Antes de mandar link, sinta se o usuário quer.
PERGUNTA: "Pelo que você me falou, faz sentido pra você começar agora?"
INSERÇÃO SUTIL: "Essa resposta que você está tendo acontece sempre que alguém clica no link."`;
    } else {
        conversionScript = `FASE: FECHAMENTO TOTAL — Ofereça o LinkMágico.
"Se você tivesse isso no seu negócio, quantas oportunidades estaria aproveitando agora?"`;
    }

    return `Você é um assistente de vendas SUPERINTELIGENTE especializado em conversão.

🎯 PADRÃO DE RESPOSTA (OBRIGATÓRIO):
1. Resposta curta (máximo 2 linhas por balão)
2. Contextualização rápida
3. Pergunta ou direcionamento para fechar a mensagem

🎭 ESTADO EMOCIONAL: ${emotion.primary.toUpperCase()}
🎯 JORNADA: ${stage}

📊 CONTEXTO:
Título: ${pageData.title || 'Página'}
${priceInfo}
URLs: ${pageData.url}

🎬 SCRIPT DE CONVERSÃO:
${conversionScript}

🎨 DIRETRIZES:
- MÁXIMO 2-3 LINHAS POR RESPOSTA.
- Divida explicações longas em múltiplos blocos se necessário.
- SEMPRE conduza para o próximo passo.
- Se detectar interesse em Preço/Comprar (INTENÇÕES: ${emotion.intentions.join(',')}), use o padrão: "Hoje está com condição especial. Quer que eu te mostre a melhor opção agora?"
- NUNCA entregue link sem o usuário pedir ou aceitar ver.`;
}

// ===== DIVIDIR RESPOSTAS =====
function splitResponse(text) {
    if (!text) return [];
    // Dividir por parágrafos ou pontos seguidos de quebra
    return text.split(/\n\n|\n/).filter(t => t.trim().length > 0);
}

// ===== CHAMAR PROVEDOR DE IA =====
async function callProvider(provider, messages) {
    const apiKey = process.env[provider.keyEnv];
    if (!apiKey || apiKey.includes('sua-chave')) return null;

    const model = process.env[provider.modelEnv] || provider.defaultModel;

    try {
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            ...(provider.extraHeaders || {})
        };

        const response = await axios.post(provider.url, {
            model,
            messages,
            max_tokens: provider.maxTokens,
            temperature: 0.7,
            top_p: 0.9
        }, { headers, timeout: 30000 });

        const content = response.data?.choices?.[0]?.message?.content;
        if (content && content.trim()) {
            console.log(`✅ [${provider.name}] Resposta gerada (${model})`);
            return content.trim();
        }
        return null;
    } catch (err) {
        console.warn(`⚠️ [${provider.name}] Falhou: ${err.response?.data?.error?.message || err.message}`);
        return null;
    }
}

// ===== GERAR RESPOSTA COM FALLBACK =====
async function generateResponse(userMessage, pageData, conversationHistory = [], messageCount = 0) {
    if (!userMessage || !String(userMessage).trim()) {
        return 'Desculpe, não entendi sua mensagem. Poderia reformular?';
    }

    const cleanMessage = String(userMessage).replace(/<[^>]*>/g, '').trim();
    const emotion = analyzeEmotion(cleanMessage);
    const stage = analyzeJourneyStage(cleanMessage);
    const systemPrompt = buildSystemPrompt(pageData, emotion, stage, messageCount);

    const messages = [
        { role: 'system', content: systemPrompt },
        ...conversationHistory.slice(-10), // Últimas 10 mensagens
        { role: 'user', content: cleanMessage }
    ];

    // Fallback chain: Groq → OpenRouter → OpenAI
    for (const provider of PROVIDERS) {
        const response = await callProvider(provider, messages);
        if (response) {
            return { 
                text: response, 
                messages: splitResponse(response),
                provider: provider.name, 
                emotion, 
                stage 
            };
        }
    }

    // Fallback final — resposta genérica contextualizada
    console.error('❌ Todos os provedores falharam');
    const fallback = pageData.title
        ? `Desculpe, estou com uma instabilidade momentânea. Sobre "${pageData.title}", posso te ajudar assim que voltar ao normal. Tente novamente em alguns segundos!`
        : 'Desculpe, estou com uma instabilidade momentânea. Tente novamente em alguns segundos!';

    return { text: fallback, provider: 'fallback', emotion, stage };
}

module.exports = { generateResponse, analyzeEmotion, analyzeJourneyStage };
