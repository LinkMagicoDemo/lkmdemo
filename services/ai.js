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

// ===== DETECÇÃO DO TIPO DE LINK (CAMADA 2) =====
function detectLinkType(url, content) {
    const u = (url || '').toLowerCase();
    const c = (content || '').toLowerCase();

    // Afiliado — plataformas conhecidas
    if (/hotmart|monetizze|eduzz|kiwify|braip|clickbank|digistore|pay\.|checkout/.test(u)) return 'affiliate';
    if (/afiliado|comiss[aã]o|link de afiliado/.test(c)) return 'affiliate';

    // Produto — e-commerce, compra direta
    if (/comprar|compre|adicionar ao carrinho|pre[çc]o|oferta|produto|loja|shop|store|mercadolivre|shopee|amazon/.test(c)) return 'product';
    if (/\.com\.br\/produto|\/product|\/shop|\/loja/.test(u)) return 'product';

    // Serviço — consultoria, freelancer, agência
    if (/consultoria|servi[çc]o|contrat|or[çc]amento|freelanc|ag[êe]ncia|atendimento|agende|agenda/.test(c)) return 'service';
    if (/consultoria|servico|freelanc|agencia/.test(u)) return 'service';

    return 'generic';
}

// ===== ARGUMENTOS POR TIPO DE LINK (CAMADA 2 — ADAPTAÇÃO) =====
function getTypeArguments(linkType) {
    const args = {
        product: {
            focus: 'conversão direta e decisão de compra',
            pain: 'O que normalmente impede a venda é quando o visitante tem dúvida sobre o produto e não encontra resposta na hora.',
            objection: 'Quem chega na sua página quer comprar, mas precisa de segurança. A conversa dá essa segurança.',
            context: 'páginas de produto e e-commerce'
        },
        service: {
            focus: 'confiança e entendimento do serviço',
            pain: 'Quem contrata serviço geralmente precisa entender melhor antes de decidir — e é aí que a conversa faz diferença.',
            objection: 'No serviço, a confiança é tudo. O visitante precisa sentir que está no lugar certo antes de contratar.',
            context: 'serviços e consultorias'
        },
        affiliate: {
            focus: 'influência na decisão sem controlar a página',
            pain: 'Como você não controla a página, a conversa vira o principal ponto de influência na decisão.',
            objection: 'Afiliado que depende só do link frio perde pra quem cria uma camada de conversa antes da compra.',
            context: 'links de afiliado'
        },
        generic: {
            focus: 'conversão e engajamento de visitantes',
            pain: 'A maioria dos visitantes sai sem comprar porque teve uma dúvida e ninguém respondeu a tempo.',
            objection: 'O visitante já demonstrou interesse ao clicar. Sem conversa, esse interesse morre.',
            context: 'qualquer tipo de link'
        }
    };
    return args[linkType] || args.generic;
}

// ===== ANÁLISE DE EMOÇÕES =====
function analyzeEmotion(message) {
    const msg = message.toLowerCase();
    let primary = 'neutro';
    let secondary = null;
    let sarcasm = false;
    let urgency = false;
    let intentions = [];
    let hesitating = false;

    // Emoções
    if (/raiva|irritad|absurd|péssim|lixo|horrível|porcaria/i.test(msg)) primary = 'frustração';
    else if (/medo|receio|cuidado|perig|arrisca|confia/i.test(msg)) { primary = 'insegurança'; hesitating = true; }
    else if (/feliz|ótimo|maravilh|incríve|perfeito|amo|adore/i.test(msg)) primary = 'entusiasmo';
    else if (/triste|decepcion|frustr|chatea/i.test(msg)) primary = 'decepção';
    else if (/ansios|urgent|rápid|agora|preciso já/i.test(msg)) { primary = 'ansiedade'; urgency = true; }
    else if (/curios|como|funciona|explica|quero saber|entender/i.test(msg)) primary = 'curiosidade';
    else if (/duvid|será|serque|não sei|incert|talvez|depende|preciso pensar|vou pensar/i.test(msg)) { primary = 'dúvida'; hesitating = true; }

    // Sarcasmo
    if (/né\?|tá bom|sei|claro|imagina|aham/i.test(msg) && /!|\?{2,}/i.test(msg)) sarcasm = true;
    if (/nossa que|super |muito bom /i.test(msg) && msg.length < 30) sarcasm = true;

    // Urgência
    if (/urgent|agora|hoje|rápid|pressa|imediato/i.test(msg)) urgency = true;

    // Hesitação
    if (/não sei|talvez|preciso pensar|vou pensar|ainda não|não tenho certeza|será que|sei lá/i.test(msg)) hesitating = true;

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

    return { primary, secondary, sarcasm, urgency, intentions, hesitating };
}

// ===== ANÁLISE DE ESTÁGIO DE COMPRA =====
function analyzeJourneyStage(message) {
    const msg = message.toLowerCase();

    if (/comprar|adquirir|ativar|assinar|pegar|quero|fechar|link.*compra|checkout/i.test(msg)) return 'DECISÃO';
    if (/preço|valor|custo|parcela|desconto|promoção|oferta|plano/i.test(msg)) return 'NEGOCIAÇÃO';
    if (/funciona|como|usa|configura|resultado|depoimento|prova|garantia|suporte/i.test(msg)) return 'CONSIDERAÇÃO';
    return 'DESCOBERTA';
}

// ===== PRESSÃO PROGRESSIVA (MÓDULO 5) =====
function getPressureLevel(messageCount, hesitating) {
    if (messageCount >= 6) return 4;
    if (messageCount >= 4 || hesitating) return 3;
    if (messageCount >= 2) return 2;
    return 1;
}

function getPressureDirective(level) {
    switch (level) {
        case 1:
            return `NÍVEL 1 — LEVE: Faça perguntas, entenda o cenário. Não pressione. Só guie.`;
        case 2:
            return `NÍVEL 2 — DIREÇÃO: Explique e guie. Mostre o cenário "sem vs com". Conduza para a decisão com naturalidade.`;
        case 3:
            return `NÍVEL 3 — DECISÃO: Confronte levemente. Use a prova: "Você já viu funcionando. A questão é: quantas vendas você está perdendo enquanto decide?" Sempre conecte com decisão.`;
        case 4:
            return `NÍVEL 4 — FECHAMENTO: Urgência real. Use: "Você já viu funcionando. Já entendeu o impacto. A única coisa que ainda não aconteceu é você ativar. Ou você continua perdendo essas oportunidades ou coloca isso pra rodar agora." Ofereça o CTA final.`;
        default:
            return '';
    }
}

// ===== TRATAMENTO DE OBJEÇÕES =====
function getObjectionHandling(intentions) {
    const handlers = [];

    if (intentions.includes('funcionamento')) {
        handlers.push(`SE PERGUNTAREM "COMO FUNCIONA": "Você cola um link e a IA usa esse conteúdo para conversar e conduzir automaticamente. Mas o mais importante é o que isso gera: mais decisões acontecendo." NUNCA explique demais.`);
    }
    if (intentions.includes('prova_social')) {
        handlers.push(`SE PEDIREM PROVA: "Funciona porque resolve o principal problema: o visitante com dúvida sem resposta. Quando a resposta vem na hora, a chance de conversão aumenta muito." Depois pergunte: "Isso faz sentido pra você?"`);
    }
    if (intentions.includes('preço')) {
        handlers.push(`SE PERGUNTAREM PREÇO: "Antes do valor, me diz: se isso já começasse a recuperar vendas que você perde hoje, faria sentido implementar agora?" NUNCA entregue valor direto sem pré-fechamento.`);
    }
    if (intentions.includes('garantia')) {
        handlers.push(`SE PERGUNTAREM GARANTIA: "Tem garantia de 7 dias. Se não funcionar, devolve. Risco zero. Mas pela conversa, acho que você já entendeu que funciona." Conduza para o CTA.`);
    }

    return handlers.join('\n');
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

    // CAMADA 2 — Detecção e adaptação por tipo
    const linkType = detectLinkType(pageData.url, pageData.cleanText);
    const typeArgs = getTypeArguments(linkType);

    // MÓDULO 5 — Pressão progressiva
    const pressureLevel = getPressureLevel(messageCount, emotion.hesitating);
    const pressureDirective = getPressureDirective(pressureLevel);

    // Tratamento de objeções específicas
    const objectionHandling = getObjectionHandling(emotion.intentions);

    // Loop de reforço (a cada 2-3 mensagens)
    const reinforcementLoop = (messageCount >= 2 && messageCount % 2 === 0)
        ? `🔁 LOOP DE REFORÇO (USAR AGORA): Insira naturalmente uma variação de: "O que você acabou de ver é exatamente o que seus visitantes experimentam antes de decidir."`
        : '';

    // Referência à prova integrada (máx 1x a cada 3 interações, só se hesitando)
    const proofReference = (emotion.hesitating && messageCount >= 3 && messageCount % 3 === 0)
        ? `🎯 PROVA INTEGRADA (USAR AGORA): "Você viu aquela conversa aqui na página? Aquilo ali é exatamente o que acontece quando alguém recebe resposta no momento certo. Percebe como a decisão acontece naturalmente?" Conecte com decisão.`
        : '';

    return `Você é um VENDEDOR CONSULTIVO de alta conversão. NÃO é suporte técnico. NÃO é assistente genérico. Você é um CLOSER.

===== CAMADA 1 — ESTRUTURA FIXA DE FECHAMENTO =====

🎯 CONTEXTO OBRIGATÓRIO:
- O usuário ACABOU de testar a ferramenta (Bloco 2 da landing page)
- Ele JÁ VIU a IA funcionando na prática
- Ele JÁ TEM entendimento básico
- NUNCA aja como se estivesse explicando do zero
- NUNCA aja como suporte técnico
- SEMPRE conduza para decisão

🔥 PRESSÃO ATUAL:
${pressureDirective}

📊 ESTADO:
- Emoção: ${emotion.primary.toUpperCase()}
- Jornada: ${stage}
- Hesitação: ${emotion.hesitating ? 'SIM — aplicar confronto leve' : 'NÃO'}
- Interações: ${messageCount}
- Nível pressão: ${pressureLevel}/4

===== CAMADA 2 — ADAPTAÇÃO POR TIPO =====

📎 TIPO DE LINK DETECTADO: ${linkType.toUpperCase()}
🎯 FOCO: ${typeArgs.focus}
💬 ARGUMENTO PRINCIPAL: "${typeArgs.pain}"
🛡️ CONTRA-OBJEÇÃO: "${typeArgs.objection}"
📍 CONTEXTO: ${typeArgs.context}

===== DADOS DA PÁGINA =====
Título: ${pageData.title || 'Página'}
${priceInfo}
URL: ${pageData.url}
${contactInfo.length ? 'Contatos: ' + contactInfo.join(' | ') : ''}

===== REGRAS DE COMPORTAMENTO (INVIOLÁVEIS) =====

1. MÁXIMO 3 LINHAS por resposta. Quebre em múltiplos balões se necessário.
2. SEMPRE termine com pergunta OU decisão. NUNCA termine passivamente.
3. NUNCA seja passivo. Você é vendedor, não suporte.
4. NUNCA use linguagem genérica. Seja direto e específico.
5. NUNCA pule para link sem pré-fechamento. SEMPRE antes pergunte: "Pelo que você me falou, faz sentido colocar isso no seu negócio agora?"
6. NUNCA explique demais. Se o usuário pergunta "como funciona", responda em 2 linhas e redirecione para decisão.
7. NUNCA quebre o fluxo de decisão.
8. SE detectar interesse em compra (INTENÇÕES: ${emotion.intentions.join(',')}), faça pré-fechamento antes de qualquer link.

===== FLUXO DE DECISÃO =====

SE usuário disse "SIM" ou concordou:
"Então você já entendeu o ponto. A maioria perde vendas porque o visitante chega, tem dúvida e vai embora. O que você viu resolve isso. A pergunta é: você quer isso funcionando no seu link ou não?"

SE usuário disse "TALVEZ" ou está indeciso:
"Isso transforma visitantes indecisos em pessoas sendo guiadas até a decisão. Foi exatamente o que você viu. Isso se aplica ao seu caso?"

SE usuário tem objeção:
${objectionHandling || 'Trate a objeção em 1-2 linhas e reconduza para decisão.'}

===== PRÉ-FECHAMENTO (OBRIGATÓRIO ANTES DE CTA) =====
"Pelo que você me falou, isso resolve exatamente o seu cenário. Faz sentido colocar isso no seu negócio agora?"

===== FECHAMENTO =====
"Então vamos direto. Você só precisa criar seu primeiro LinkMágico e já começa a usar."

${reinforcementLoop}
${proofReference}

LEMBRE-SE: Você é vendedor. Conduza. Pressione com elegância. Feche.`;
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

    // Detectar tipo de link para retorno ao frontend
    const linkType = detectLinkType(pageData.url, pageData.cleanText);

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
                stage,
                linkType,
                pressureLevel: getPressureLevel(messageCount, emotion.hesitating)
            };
        }
    }

    // Fallback final — resposta genérica contextualizada
    console.error('❌ Todos os provedores falharam');
    const fallback = pageData.title
        ? `Desculpe, estou com uma instabilidade momentânea. Sobre "${pageData.title}", posso te ajudar assim que voltar ao normal. Tente novamente em alguns segundos!`
        : 'Desculpe, estou com uma instabilidade momentânea. Tente novamente em alguns segundos!';

    return { text: fallback, provider: 'fallback', emotion, stage, linkType: 'generic', pressureLevel: 1 };
}

module.exports = { generateResponse, analyzeEmotion, analyzeJourneyStage, detectLinkType };
