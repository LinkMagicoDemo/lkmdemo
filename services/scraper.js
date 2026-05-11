const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Extrai dados de uma página web com foco em conteúdo comercial relevante
 */
async function extractPageData(url) {
    const startTime = Date.now();

    if (!url) throw new Error('URL é obrigatória');

    // Validar URL
    try { new URL(url); } catch { throw new Error('URL inválida'); }

    const extractedData = {
        title: '',
        description: '',
        cleanText: '',
        summary: '',
        url: url,
        prices: [],
        cta: '',
        benefits: [],
        testimonials: [],
        contacts: { telefone: [], whatsapp: [], email: [], site: [url] },
        method: 'axios-cheerio',
        extractionTime: 0
    };

    let html = '';

    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8'
            },
            timeout: 15000,
            maxRedirects: 5,
            validateStatus: () => true // Aceita QUALQUER status (200, 404, 500, etc.)
        });
        html = response.data || '';
        const finalUrl = response.request?.res?.responseUrl || url;
        if (finalUrl && finalUrl !== url) extractedData.url = finalUrl;
        if (response.status >= 400) {
            console.warn(`⚠️ Página retornou status ${response.status}, tentando extrair conteúdo mesmo assim...`);
        }
    } catch (err) {
        console.warn(`⚠️ Erro ao acessar ${url}: ${err.message}`);
        // NÃO lançar erro — criar sessão com dados mínimos baseados na URL
        html = '';
    }

    // Se não conseguiu HTML, gerar dados mínimos a partir da URL
    if (!html || html.length < 100) {
        console.warn(`⚠️ Conteúdo vazio/curto para ${url}. Usando fallback baseado na URL.`);
        const urlObj = new URL(url);
        const domain = urlObj.hostname.replace('www.', '');
        const pathParts = urlObj.pathname.split('/').filter(p => p.length > 0);
        const pageName = pathParts.length > 0
            ? pathParts[pathParts.length - 1].replace(/[-_]/g, ' ').replace(/\.\w+$/, '')
            : domain;

        extractedData.title = pageName.charAt(0).toUpperCase() + pageName.slice(1) + ' — ' + domain;
        extractedData.description = `Página de ${domain}${urlObj.pathname !== '/' ? ' — ' + urlObj.pathname : ''}`;
        extractedData.cleanText = `Site: ${domain}. Página: ${pageName}. URL completa: ${url}`;
        extractedData.summary = extractedData.description;
        extractedData.extractionTime = Date.now() - startTime;
        console.log(`✅ Extração fallback: "${extractedData.title}" (dados mínimos da URL)`);
        return extractedData;
    }

    try {
        const $ = cheerio.load(html);
        $('script, style, noscript, iframe, svg, nav, footer').remove();

        // Título — priorizar meta tags (nome real do produto) sobre h1 (headline do Hero)
        const ogTitle = $('meta[property="og:title"]').attr('content')?.trim();
        const ogSiteName = $('meta[property="og:site_name"]').attr('content')?.trim();
        const metaTitle = $('title').text()?.trim();
        const twitterTitle = $('meta[name="twitter:title"]').attr('content')?.trim();
        const h1Text = $('h1').first().text()?.trim();

        // Prioridade: og:site_name > og:title > <title> > twitter:title > h1
        // og:site_name geralmente é o nome real da marca/produto
        const titleCandidates = [ogSiteName, ogTitle, metaTitle, twitterTitle, h1Text];
        for (const t of titleCandidates) {
            if (t && t.length > 3 && t.length < 120) { extractedData.title = t; break; }
        }

        // Descrição — múltiplas fontes
        const descSelectors = ['meta[name="description"]', 'meta[property="og:description"]', '.description', '.subtitle', '.sub-headline', 'article p', 'main p', '.hero p', 'header p'];
        for (const sel of descSelectors) {
            const el = $(sel).first();
            const d = (el.attr('content') || el.text() || '').trim();
            if (d && d.length > 20 && d.length < 1000) { extractedData.description = d; break; }
        }

        // Texto limpo — priorizar conteúdo principal
        const mainSelectors = ['main', 'article', '[role="main"]', '.content', '.page-content', '#content'];
        let bodyText = '';
        for (const sel of mainSelectors) {
            const mainEl = $(sel).first();
            if (mainEl.length) {
                bodyText = mainEl.text().replace(/\s+/g, ' ').trim();
                if (bodyText.length > 200) break;
            }
        }
        if (!bodyText || bodyText.length < 200) {
            bodyText = $('body').text().replace(/\s+/g, ' ').trim();
        }
        extractedData.cleanText = bodyText.substring(0, 6000);

        // Resumo inteligente — frases mais relevantes
        const sentences = bodyText.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 15 && s.length < 300);
        // Priorizar frases com palavras comerciais
        const commercialWords = /benefício|resultado|garantia|exclusiv|premium|acesso|aprend|transform|descubra|método|estratégia|solução|problema|oferta|oportunidade|gratuito|bônus/i;
        const prioritySentences = sentences.filter(s => commercialWords.test(s));
        const regularSentences = sentences.filter(s => !commercialWords.test(s));
        const bestSentences = [...prioritySentences.slice(0, 5), ...regularSentences.slice(0, 5)].slice(0, 8);
        extractedData.summary = bestSentences.join('. ').substring(0, 800);

        // Preços — padrões brasileiros e internacionais
        const pricePatterns = [
            /R\$\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?/gi,
            /\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?\s*reais/gi,
            /(?:de\s+)?R\$\s*[\d.,]+\s*(?:por|\/)\s*R\$\s*[\d.,]+/gi,
            /\d{1,2}x\s*(?:de\s*)?R\$\s*[\d.,]+/gi
        ];
        const prices = new Set();
        pricePatterns.forEach(p => {
            const m = bodyText.match(p);
            if (m) m.forEach(price => prices.add(price.trim()));
        });
        extractedData.prices = Array.from(prices).slice(0, 8);

        // Benefícios — extrair de listas e headings
        const benefits = [];
        $('li, .benefit, .feature, .vantagem, [class*="benefit"], [class*="feature"]').each((_, el) => {
            const text = $(el).text().trim();
            if (text.length > 10 && text.length < 200 && !/<|script/i.test(text)) {
                benefits.push(text);
            }
        });
        extractedData.benefits = [...new Set(benefits)].slice(0, 10);

        // Depoimentos/Testimonials
        const testimonials = [];
        $('[class*="testimonial"], [class*="depoimento"], [class*="review"], blockquote, .testimonial').each((_, el) => {
            const text = $(el).text().trim();
            if (text.length > 20 && text.length < 500) {
                testimonials.push(text);
            }
        });
        extractedData.testimonials = [...new Set(testimonials)].slice(0, 5);

        // Contatos
        const phoneRegex = /(?:\+55\s?)?(?:\(?\d{2}\)?\s?)\d{4,5}[-.\s]?\d{4}/g;
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
        const whatsRegex = /(?:wa\.me|whatsapp\.com\/send\?phone=)[\d]+/gi;

        const phones = bodyText.match(phoneRegex) || [];
        const emails = bodyText.match(emailRegex) || [];
        const whats = html.match(whatsRegex) || [];

        // Também buscar links de WhatsApp no HTML
        $('a[href*="wa.me"], a[href*="whatsapp"]').each((_, el) => {
            const href = $(el).attr('href') || '';
            if (href) whats.push(href);
        });

        extractedData.contacts.telefone = [...new Set(phones)].slice(0, 3);
        extractedData.contacts.email = [...new Set(emails)].slice(0, 3);
        extractedData.contacts.whatsapp = [...new Set(whats)].slice(0, 3);

        // CTA (botões de ação) — expandido
        const ctaTexts = [];
        $('a, button, [role="button"]').each((_, el) => {
            const text = $(el).text().trim();
            const href = $(el).attr('href') || '';
            if (text.length > 3 && text.length < 60 && /compra|assina|ativ|testar|come[cç]|adquir|garanti|inscreva|cadastr|acesse|saiba|quero|baixar|download|entrar|acess|ver|conhecer/i.test(text)) {
                ctaTexts.push({ text, href });
            }
        });
        if (ctaTexts.length > 0) extractedData.cta = ctaTexts[0].text;

    } catch (err) {
        console.warn(`⚠️ Erro no parsing: ${err.message}`);
    }

    extractedData.extractionTime = Date.now() - startTime;
    console.log(`✅ Extração concluída: "${extractedData.title}" (${extractedData.cleanText.length} chars, ${extractedData.prices.length} preços, ${extractedData.benefits.length} benefícios, ${extractedData.extractionTime}ms)`);

    return extractedData;
}

module.exports = { extractPageData };
