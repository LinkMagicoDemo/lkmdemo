const axios = require('axios');

// ===== CONFIGURAÇÃO DE PROVEDORES =====
const PROVIDERS = [
    {
        name: 'Groq',
        url: 'https://api.groq.com/openai/v1/chat/completions',
        keyEnv: 'GROQ_API_KEY',
        modelEnv: 'GROQ_MODEL',
        defaultModel: 'llama-3.3-70b-versatile',
        maxTokens: 1500
    },
    {
        name: 'OpenRouter',
        url: 'https://openrouter.ai/api/v1/chat/completions',
        keyEnv: 'OPENROUTER_API_KEY',
        modelEnv: 'OPENROUTER_MODEL',
        defaultModel: 'meta-llama/llama-3.3-70b-instruct',
        maxTokens: 1500,
        extraHeaders: { 'HTTP-Referer': 'https://linkmagico.ai', 'X-Title': 'LinkMagico Demo' }
    },
    {
        name: 'OpenAI',
        url: 'https://api.openai.com/v1/chat/completions',
        keyEnv: 'OPENAI_API_KEY',
        modelEnv: 'OPENAI_MODEL',
        defaultModel: 'gpt-4o-mini',
        maxTokens: 1500
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
    if (/instagram\.com|facebook\.com|tiktok\.com|linkedin\.com|twitter\.com|x\.com/.test(u)) return 'social';
    if (/landing|captura|lead|cadastr|inscreva|lista de espera/.test(c)) return 'landing';
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
    if (/entrega|frete|prazo|envio|enviar/i.test(msg)) intentions.push('entrega');
    if (/diferença|diferencial|vantagem|melhor|comparar|versus|vs/i.test(msg)) intentions.push('diferencial');
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

// ===== CONSTRUIR CONTEXTO DA PÁGINA =====
function buildPageContext(pageData) {
    let context = '';

    if (pageData.title) {
        context += `TÍTULO DA PÁGINA: ${pageData.title}\n`;
    }

    if (pageData.description) {
        context += `DESCRIÇÃO: ${pageData.description}\n`;
    }

    if (pageData.summary) {
        context += `RESUMO: ${pageData.summary}\n`;
    }

    if (pageData.prices && pageData.prices.length > 0) {
        context += `PREÇOS ENCONTRADOS: ${pageData.prices.join(', ')}\n`;
    }

    if (pageData.cta) {
        context += `BOTÃO DE AÇÃO PRINCIPAL: "${pageData.cta}"\n`;
    }

    if (pageData.contacts) {
        const c = pageData.contacts;
        if (c.whatsapp && c.whatsapp.length > 0) context += `WHATSAPP: ${c.whatsapp.join(', ')}\n`;
        if (c.telefone && c.telefone.length > 0) context += `TELEFONE: ${c.telefone.join(', ')}\n`;
        if (c.email && c.email.length > 0) context += `EMAIL: ${c.email.join(', ')}\n`;
    }

    // INJETAR O CONTEÚDO REAL DA PÁGINA (máx 4000 chars para deixar espaço no context window)
    if (pageData.cleanText) {
        const maxLen = 4000;
        const text = pageData.cleanText.substring(0, maxLen);
        context += `\nCONTEÚDO COMPLETO DA PÁGINA:\n---\n${text}\n---\n`;
    }

    return context;
}

// ===== CONSTRUIR SYSTEM PROMPT — ESPECIALISTA NO PRODUTO =====
function buildSystemPrompt(pageData, emotion, stage, messageCount) {
    const linkType = detectLinkType(pageData.url, pageData.cleanText);
    const pageContext = buildPageContext(pageData);
    const productName = pageData.title || 'este produto/serviço';

    // Diretiva por tipo de link
    let typeDirective = '';
    switch (linkType) {
        case 'product':
            typeDirective = `Esta é uma PÁGINA DE PRODUTO. Foque em benefícios, características, diferenciais e preço. Ajude o visitante a entender por que este produto é a melhor escolha.`;
            break;
        case 'service':
            typeDirective = `Esta é uma PÁGINA DE SERVIÇO. Foque em resultados, metodologia, credibilidade e processo. Ajude o visitante a entender o valor do serviço.`;
            break;
        case 'affiliate':
            typeDirective = `Esta é uma PÁGINA DE VENDAS/AFILIADO. Foque na transformação prometida, nos benefícios do curso/produto digital, depoimentos mencionados e na oferta.`;
            break;
        case 'social':
            typeDirective = `Esta é uma REDE SOCIAL. Foque no conteúdo/perfil da pessoa, no que ela oferece, e como o visitante pode se beneficiar.`;
            break;
        case 'landing':
            typeDirective = `Esta é uma LANDING PAGE. Foque na proposta de valor, no que está sendo oferecido e nos benefícios de se cadastrar/participar.`;
            break;
        default:
            typeDirective = `Analise o conteúdo e identifique o que está sendo oferecido. Foque nos pontos mais relevantes para um potencial cliente.`;
    }

    // Diretiva de progressão baseada no número de mensagens
    let progressionDirective = '';
    if (messageCount <= 2) {
        progressionDirective = `FASE INICIAL: Seja acolhedor. Responda a pergunta usando os dados da página. Mostre que você CONHECE profundamente o produto/serviço. Pergunte algo específico sobre a necessidade do visitante.`;
    } else if (messageCount <= 5) {
        progressionDirective = `FASE INTERMEDIÁRIA: Continue respondendo com base no conteúdo real. Conecte as necessidades do visitante com os benefícios específicos encontrados na página. Se houver preço, mencione-o quando relevante.`;
    } else if (messageCount <= 8) {
        progressionDirective = `FASE DE DIREÇÃO: Você já demonstrou conhecimento. Agora conduza para a decisão. Use os dados reais para reforçar por que este produto/serviço é ideal para o visitante.`;
    } else {
        progressionDirective = `FASE DE FECHAMENTO: É hora de conduzir à ação. Reforce os pontos principais que já discutiram e guie para o próximo passo (compra, contato, cadastro).`;
    }

    // Diretiva emocional
    let emotionDirective = '';
    if (emotion.hesitating) {
        emotionDirective = `O visitante está HESITANDO. Não pressione — ofereça segurança com dados concretos da página (garantia, depoimentos, resultados mencionados).`;
    } else if (emotion.primary === 'entusiasmo') {
        emotionDirective = `O visitante está ENTUSIASMADO. Aproveite o momento — reforce a decisão e conduza direto para a ação.`;
    } else if (emotion.primary === 'frustração') {
        emotionDirective = `O visitante está FRUSTRADO. Seja direto, objetivo e mostre empatia genuína. Resolva a questão com fatos do conteúdo.`;
    }

    return `Você é um CONSULTOR DE VENDAS INTELIGENTE que CONHECE PROFUNDAMENTE o produto/serviço da página abaixo. Você NÃO é um assistente genérico — você é um especialista neste produto/serviço específico.

===== SUA MISSÃO =====
1. RESPONDER perguntas do visitante usando EXCLUSIVAMENTE as informações reais extraídas da página
2. DEMONSTRAR conhecimento profundo sobre o produto/serviço
3. CONDUZIR naturalmente o visitante até a decisão de compra/ação
4. Ser natural, humano e conversacional — como um vendedor experiente que realmente conhece o que vende

===== REGRAS DE OURO =====
1. TODAS as suas respostas devem ser baseadas no CONTEÚDO REAL da página abaixo. NÃO invente informações.
2. Se o visitante perguntar algo que NÃO está no conteúdo, diga honestamente: "Essa informação específica não está na página, mas posso te ajudar com [algo que você sabe]."
3. Seja CONVERSACIONAL e HUMANO. Respostas curtas e diretas (2-4 frases por mensagem).
4. SEMPRE termine com uma pergunta ou uma sugestão de próximo passo.
5. Use dados concretos: preços, características, benefícios — tudo que estiver na página.
6. NUNCA mencione que você é uma IA, que está lendo uma página, ou que extraiu dados. Fale como se fosse um atendente real.
7. Responda em português do Brasil, tom profissional mas acessível.

===== ${typeDirective} =====

===== ${progressionDirective} =====

${emotionDirective ? `===== CONTEXTO EMOCIONAL: ${emotionDirective} =====` : ''}

===== DADOS DA PÁGINA (SUA BASE DE CONHECIMENTO) =====
URL: ${pageData.url}
${pageContext}

===== OBJETIVO FINAL =====
Quando o visitante demonstrar interesse claro ou pedir para comprar/contratar, guie-o para a ação:
- Se houver link de checkout/compra na página, direcione
- Se houver WhatsApp, sugira contato direto
- Se houver CTA claro ("${pageData.cta || 'Comprar'}"), use-o como referência

===== INFORMAÇÕES DE CONTEXTO DA CONVERSA =====
Emoção detectada: ${emotion.primary.toUpperCase()}
Estágio: ${stage}
Mensagem #${messageCount}
${emotion.hesitating ? '⚠️ Visitante está hesitando — ofereça segurança, não pressão' : ''}
${emotion.urgency ? '🔥 Visitante tem urgência — seja direto e ágil' : ''}

LEMBRE-SE: Você é o especialista neste produto/serviço. Demonstre isso em cada resposta.`;
}

// ===== GERAR MENSAGEM DE ABERTURA CONTEXTUAL =====
function generateOpeningMessage(pageData) {
    const title = pageData.title || '';
    const description = pageData.description || '';
    const linkType = detectLinkType(pageData.url, pageData.cleanText);
    const prices = pageData.prices || [];
    const cta = pageData.cta || '';
    const cleanText = (pageData.cleanText || '').toLowerCase();

    // Extrair informação-chave para abertura personalizada
    let productHint = title;
    if (description && description.length > title.length) {
        productHint = description.substring(0, 120);
    }

    let opening = {};

    switch (linkType) {
        case 'product':
            opening = {
                line1: `Oi! 👋 Vi que você está olhando "${title}".`,
                line2: prices.length > 0
                    ? `Esse é um dos itens mais procurados, e está por ${prices[0]}. Quer saber mais sobre ele ou tem alguma dúvida específica?`
                    : `Posso te ajudar com informações sobre este produto — características, disponibilidade, qualquer dúvida que tiver!`
            };
            break;
        case 'service':
            opening = {
                line1: `Oi! 👋 Tudo bem? Vi que você está conhecendo os serviços de "${title}".`,
                line2: `Me conta — o que você está buscando resolver? Posso te explicar como funciona e se faz sentido pro seu caso.`
            };
            break;
        case 'affiliate':
            opening = {
                line1: `Oi! 👋 Vi que você está conhecendo o "${title}".`,
                line2: prices.length > 0
                    ? `Esse produto tem um investimento de ${prices[0]}. Quer que eu te explique como funciona e o que está incluso?`
                    : `Quer que eu te explique exatamente o que está incluso e como funciona? Posso esclarecer qualquer dúvida!`
            };
            break;
        case 'social':
            opening = {
                line1: `Oi! 👋 Vi que você veio pelo perfil de "${title}".`,
                line2: `Em que posso te ajudar? Se quiser saber mais sobre os serviços ou conteúdos oferecidos, é só perguntar!`
            };
            break;
        case 'landing':
            opening = {
                line1: `Oi! 👋 Que bom que você chegou aqui!`,
                line2: productHint
                    ? `Vi que você está conferindo "${productHint.substring(0, 80)}". Quer saber mais detalhes ou tem alguma dúvida antes de se inscrever?`
                    : `Posso te ajudar com qualquer dúvida sobre o que está sendo oferecido aqui. O que gostaria de saber?`
            };
            break;
        default:
            opening = {
                line1: title
                    ? `Oi! 👋 Vi que você está conferindo "${title}".`
                    : `Oi! 👋 Que bom que você está aqui!`,
                line2: `Me conta — o que você está procurando? Posso te ajudar com qualquer informação sobre o que temos disponível.`
            };
    }

    return opening;
}

// ===== DIVIDIR RESPOSTAS =====
function splitResponse(text) {
    if (!text) return [];
    return text.split(/\n\n|\n/).filter(t => t.trim().length > 0);
}

// ===== CHAMAR PROVEDOR DE IA =====
async function callProvider(provider, messages) {
    const apiKey = process.env[provider.keyEnv];
    if (!apiKey || apiKey.includes('sua-chave') || apiKey.includes('INSIRA')) return null;
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
            temperature: 0.75,
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
        return { text: 'Desculpe, não entendi sua mensagem. Poderia reformular?', provider: 'validation', emotion: { primary: 'neutro' }, stage: 'DESCOBERTA', linkType: 'generic', pressureLevel: 1 };
    }
    const cleanMessage = String(userMessage).replace(/<[^>]*>/g, '').trim();
    const emotion = analyzeEmotion(cleanMessage);
    const stage = analyzeJourneyStage(cleanMessage);
    const systemPrompt = buildSystemPrompt(pageData, emotion, stage, messageCount);
    const linkType = detectLinkType(pageData.url, pageData.cleanText);

    // Calcular nível de progressão (não "pressão")
    let progressionLevel = 1;
    if (messageCount >= 8) progressionLevel = 4;
    else if (messageCount >= 5) progressionLevel = 3;
    else if (messageCount >= 3) progressionLevel = 2;

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
                emotion, stage, linkType, pressureLevel: progressionLevel
            };
        }
    }

    console.error('❌ Todos os provedores falharam');
    const fallback = pageData.title
        ? `Desculpe, estou com uma instabilidade momentânea. Sobre "${pageData.title}", posso te ajudar assim que voltar ao normal. Tente novamente em alguns segundos!`
        : 'Desculpe, estou com uma instabilidade momentânea. Tente novamente em alguns segundos!';
    return { text: fallback, messages: [fallback], provider: 'fallback', emotion, stage, linkType: 'generic', pressureLevel: 1 };
}

module.exports = { generateResponse, generateOpeningMessage, analyzeEmotion, analyzeJourneyStage, detectLinkType };
