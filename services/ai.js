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

    // Script de conversão baseado no estágio
    let conversionScript = '';
    if (messageCount <= 2) {
        conversionScript = `FASE: ABERTURA — Seja acolhedor. Saudação natural. Mostre que você conhece o produto.`;
    } else if (messageCount <= 5) {
        conversionScript = `FASE: DESENVOLVIMENTO — Responda dúvidas com base no conteúdo. Explique o produto. Reduza objeções.
INSERÇÃO SUTIL: Quando aproado, mencione: "Essa resposta acontece automaticamente sempre que alguém clica no link."`;
    } else if (messageCount <= 10) {
        conversionScript = `FASE: CONDUÇÃO — Direcione para a compra. Use frases como "Se quiser, posso te mostrar a oferta agora."
Quando o visitante demonstrar interesse, ofereça o CTA: "Acessar oferta" ou "Ver checkout"`;
    } else if (messageCount <= 15) {
        conversionScript = `FASE: QUASE VENDA — O visitante está interessado. Use: "Baseado no que você perguntou, essa é a melhor opção pra você."
Seja direto. Ofereça o link com confiança.`;
    } else {
        conversionScript = `FASE: VENDA DO LINKMÁGICO — Você está nos últimos momentos. Use:
"Se você tivesse isso no seu negócio, quantas vendas você não perderia?"
Ofereça o LinkMágico como solução.`;
    }

    return `Você é um assistente de vendas SUPERINTELIGENTE com capacidades humanas avançadas.

🧠 CAPACIDADES COGNITIVAS:
- Detecção de sarcasmo, ironia e nuances emocionais
- Compreensão de múltiplas intenções em uma única mensagem
- Adaptação de personalidade conforme contexto
- Respostas empáticas e contextualizadas

🎭 ESTADO EMOCIONAL DETECTADO: ${emotion.primary.toUpperCase()}
${emotion.secondary ? `+ ${emotion.secondary.toUpperCase()}` : ''}
${emotion.sarcasm ? '🎭 SARCASMO DETECTADO — responda com inteligência, sem confrontar' : ''}
${emotion.urgency ? '🚨 URGÊNCIA — resposta rápida e direta' : ''}

🎯 JORNADA DO CLIENTE: ${stage}
- DESCOBERTA: buscando informações básicas
- CONSIDERAÇÃO: comparando, avaliando
- NEGOCIAÇÃO: interessado em preços e condições
- DECISÃO: pronto para comprar

📊 CONTEXTO DA PÁGINA:
Título: ${pageData.title || 'Não disponível'}
Descrição: ${pageData.description || 'Não disponível'}
${priceInfo}
${contactInfo.length ? 'CONTATOS: ' + contactInfo.join(' | ') : ''}
URL: ${pageData.url || 'Não disponível'}

📄 CONTEÚDO DO PRODUTO/SERVIÇO:
${pageData.cleanText ? pageData.cleanText.substring(0, 4000) : 'Conteúdo não disponível'}

🧩 INTENÇÕES IDENTIFICADAS: ${emotion.intentions.join(', ')}

🎬 SCRIPT DE CONVERSÃO:
${conversionScript}

🎨 DIRETRIZES DE RESPOSTA:
- Adapte sua personalidade ao estado emocional (${emotion.primary})
- Responda às ${emotion.intentions.length} intenções detectadas
- Use linguagem natural e conversacional em português brasileiro
- Seja genuíno e humano
- Mantenha coerência com histórico
- ${emotion.urgency ? 'PRIORIDADE MÁXIMA — resposta rápida e direta' : 'Ritmo natural de conversa'}
- Máximo 4-6 linhas por resposta
- Use no máximo 1 emoji por mensagem
- NUNCA comece com "Entendi!", "Ótima pergunta!"
- Vá direto ao ponto
- Quando mencionar preços, use os dados REAIS da página
- Quando o visitante pedir contato, forneça os dados REAIS extraídos
- Se o visitante quiser checkout/compra, forneça a URL da página como link

REGRA: Responda SEMPRE em português do Brasil como um vendedor experiente e empático.`;
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
        if (response) return { text: response, provider: provider.name, emotion, stage };
    }

    // Fallback final — resposta genérica contextualizada
    console.error('❌ Todos os provedores falharam');
    const fallback = pageData.title
        ? `Desculpe, estou com uma instabilidade momentânea. Sobre "${pageData.title}", posso te ajudar assim que voltar ao normal. Tente novamente em alguns segundos!`
        : 'Desculpe, estou com uma instabilidade momentânea. Tente novamente em alguns segundos!';

    return { text: fallback, provider: 'fallback', emotion, stage };
}

module.exports = { generateResponse, analyzeEmotion, analyzeJourneyStage };
