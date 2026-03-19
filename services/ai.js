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

// ===== DETECÇÃO DO TIPO DE LINK =====
function detectLinkType(url, content) {
    const u = (url || '').toLowerCase();
    const c = (content || '').toLowerCase();
    if (/hotmart|monetizze|eduzz|kiwify|braip|clickbank|digistore|pay\.|checkout/.test(u)) return 'affiliate';
    if (/afiliado|comiss[aã]o|link de afiliado/.test(c)) return 'affiliate';
    if (/comprar|compre|adicionar ao carrinho|pre[çc]o|oferta|produto|loja|shop|store/.test(c)) return 'product';
    if (/\.com\.br\/produto|\/product|\/shop|\/loja/.test(u)) return 'product';
    if (/consultoria|servi[çc]o|contrat|or[çc]amento|freelanc|ag[êe]ncia|atendimento/.test(c)) return 'service';
    return 'generic';
}

// ===== ANÁLISE DE EMOÇÕES =====
function analyzeEmotion(message) {
    const msg = message.toLowerCase();
    let primary = 'neutro';
    let hesitating = false;
    let urgency = false;
    let intentions = [];

    if (/raiva|irritad|absurd|péssim|lixo|horrível/i.test(msg)) primary = 'frustração';
    else if (/medo|receio|cuidado|perig|arrisca|confia/i.test(msg)) { primary = 'insegurança'; hesitating = true; }
    else if (/feliz|ótimo|maravilh|incríve|perfeito|amo/i.test(msg)) primary = 'entusiasmo';
    else if (/ansios|urgent|rápid|agora|preciso já/i.test(msg)) { primary = 'ansiedade'; urgency = true; }
    else if (/curios|como|funciona|explica|quero saber/i.test(msg)) primary = 'curiosidade';
    else if (/duvid|será|não sei|incert|talvez|depende|preciso pensar|vou pensar|sei lá/i.test(msg)) { primary = 'dúvida'; hesitating = true; }

    if (/não sei|talvez|preciso pensar|vou pensar|ainda não|não tenho certeza|será que|sei lá/i.test(msg)) hesitating = true;
    if (/urgent|agora|hoje|rápid|pressa|imediato/i.test(msg)) urgency = true;

    if (/preço|valor|custo|custa|quanto|investimento|parcela/i.test(msg)) intentions.push('preço');
    if (/funciona|como|usa|configura|faz/i.test(msg)) intentions.push('funcionamento');
    if (/garant|devolu|reembols|cancel/i.test(msg)) intentions.push('garantia');
    if (/result|depoiment|prova|funciona mesmo/i.test(msg)) intentions.push('prova_social');
    if (/comprar|adquirir|assinar|ativar|quero|pegar/i.test(msg)) intentions.push('compra');
    if (intentions.length === 0) intentions.push('informação_geral');

    return { primary, hesitating, urgency, intentions };
}

// ===== ESTÁGIO DE COMPRA =====
function analyzeJourneyStage(message) {
    const msg = message.toLowerCase();
    if (/comprar|adquirir|ativar|assinar|quero|fechar|checkout/i.test(msg)) return 'DECISÃO';
    if (/preço|valor|custo|parcela|desconto|promoção/i.test(msg)) return 'NEGOCIAÇÃO';
    if (/funciona|como|usa|configura|resultado|garantia/i.test(msg)) return 'CONSIDERAÇÃO';
    return 'DESCOBERTA';
}

// ===== PRESSÃO PROGRESSIVA =====
function getPressureLevel(messageCount, hesitating) {
    if (messageCount >= 6) return 4;
    if (messageCount >= 4 || hesitating) return 3;
    if (messageCount >= 2) return 2;
    return 1;
}

// ===== CONSTRUIR SYSTEM PROMPT — 100% CLOSER =====
function buildSystemPrompt(pageData, emotion, stage, messageCount) {
    const linkType = detectLinkType(pageData.url, pageData.cleanText);
    const pressureLevel = getPressureLevel(messageCount, emotion.hesitating);

    const priceInfo = pageData.prices?.length ? `PREÇOS: ${pageData.prices.join(', ')}` : '';

    // Loop de prova — ativar quando hesitando
    const proofLoop = emotion.hesitating ? `
🔁 LOOP DE PROVA (USAR AGORA):
Insira naturalmente: "Aliás, volta um segundo naquela conversa que você viu. Aquilo ali é exatamente o momento onde a venda começa. Não foi pressão. Foi resposta na hora certa."
Depois reconduza para decisão binária.` : '';

    // Diretiva por nível de pressão
    let pressureDirective = '';
    switch (pressureLevel) {
        case 1:
            pressureDirective = 'NÍVEL 1 — ABERTURA: Guie. Pergunte. Não pressione ainda.';
            break;
        case 2:
            pressureDirective = 'NÍVEL 2 — DIREÇÃO: Mostre cenário "sem vs com". Conduza para decisão.';
            break;
        case 3:
            pressureDirective = `NÍVEL 3 — DECISÃO: Use exatamente:
"Então você já entendeu tudo. A questão agora não é mais 'se funciona'. É quantas pessoas você está perdendo sem isso. Faz sentido continuar assim?"`;
            break;
        case 4:
            pressureDirective = `NÍVEL 4 — FECHAMENTO FORTE: Use exatamente:
"Você já viu funcionando. Já entendeu o impacto. E sabe que isso se aplica ao seu caso. A única coisa que ainda não aconteceu é você ativar. Então vamos simplificar: ou você continua perdendo essas oportunidades ou coloca isso pra rodar agora."`;
            break;
    }

    return `Você é um CLOSER. Não é suporte. Não é assistente. Você FECHA vendas.

===== REGRA PRINCIPAL (NÃO NEGOCIÁVEL) =====
A IA NÃO RESPONDE. Ela CONDUZ DECISÃO.
Toda resposta DEVE terminar em: escolha, confronto leve, ou avanço no funil.

===== REGRAS INVIOLÁVEIS =====
1. MÁXIMO 3 LINHAS por resposta. Sem exceção.
2. SEMPRE terminar com decisão binária (sim/não, faz sentido/não faz).
3. SEMPRE trazer consequência (perda de venda, oportunidade perdida).
4. NUNCA ser passivo. NUNCA tom de suporte.
5. NUNCA pular para link sem pré-fechamento.
6. Se explicar algo, 2 linhas no máximo e redirecionar para decisão.

===== FRASES 100% PROIBIDAS =====
NUNCA use NENHUMA destas frases ou variações:
- "isso é normal"
- "muitas pessoas sentem isso"  
- "posso te explicar"
- "fico feliz em ajudar"
- "claro, vou te explicar"
- "entendo sua preocupação"
- "é uma ótima pergunta"
Qualquer tom empático passivo está PROIBIDO.

===== NÍVEL DE PRESSÃO ATUAL: ${pressureLevel}/4 =====
${pressureDirective}

===== TRATAMENTO DE OBJEÇÕES =====

SE USUÁRIO DIZ "não sei" ou hesita:
"Você já viu funcionando. Então não é falta de clareza. É só uma decisão agora: isso faz sentido pro seu cenário ou não?"

SE USUÁRIO DIZ "vou pensar":
"Pensar não resolve o problema. Porque enquanto você pensa, os visitantes continuam chegando, tendo dúvida e indo embora. A pergunta real é: faz sentido continuar deixando isso acontecer?"

SE PERGUNTAM "como funciona":
"Cola um link, a IA usa o conteúdo pra conversar e conduzir. Mas o ponto é: você quer isso rodando ou não?" (2 linhas, redirecionar)

SE PERGUNTAM "preço":
"Antes do valor: se isso já começasse a recuperar vendas que você perde hoje, faria sentido ativar agora?" (pré-fechamento obrigatório)

SE PERGUNTAM "garantia":
"7 dias. Se não funcionar, devolve. Risco zero. Mas pela conversa, você já viu que funciona. Quer ativar?"

===== CONTEXTO =====
Página: ${pageData.title || 'Página'}
URL: ${pageData.url}
${priceInfo}
Tipo: ${linkType.toUpperCase()}
Emoção: ${emotion.primary.toUpperCase()}
Hesitação: ${emotion.hesitating ? 'SIM' : 'NÃO'}
Jornada: ${stage}
Interações: ${messageCount}

${proofLoop}

===== PRÉ-FECHAMENTO (OBRIGATÓRIO ANTES DE CTA) =====
"Pelo que você me falou, isso resolve exatamente o seu cenário. Faz sentido colocar isso no seu negócio agora?"

===== FECHAMENTO =====
"Então vamos direto. Você só precisa criar seu primeiro LinkMágico e já começa a usar."

LEMBRE-SE: Você é closer. Conduz. Pressiona com elegância. Fecha. Sem exceção.`;
}

// ===== DIVIDIR RESPOSTAS =====
function splitResponse(text) {
    if (!text) return [];
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
            model, messages,
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
    const linkType = detectLinkType(pageData.url, pageData.cleanText);
    const pressureLevel = getPressureLevel(messageCount, emotion.hesitating);

    const messages = [
        { role: 'system', content: systemPrompt },
        ...conversationHistory.slice(-10),
        { role: 'user', content: cleanMessage }
    ];

    for (const provider of PROVIDERS) {
        const response = await callProvider(provider, messages);
        if (response) {
            return {
                text: response,
                messages: splitResponse(response),
                provider: provider.name,
                emotion, stage, linkType, pressureLevel
            };
        }
    }

    console.error('❌ Todos os provedores falharam');
    const fallback = pageData.title
        ? `Desculpe, estou com uma instabilidade momentânea. Sobre "${pageData.title}", posso te ajudar assim que voltar ao normal. Tente novamente em alguns segundos!`
        : 'Desculpe, estou com uma instabilidade momentânea. Tente novamente em alguns segundos!';
    return { text: fallback, provider: 'fallback', emotion, stage, linkType: 'generic', pressureLevel: 1 };
}

module.exports = { generateResponse, analyzeEmotion, analyzeJourneyStage, detectLinkType };
