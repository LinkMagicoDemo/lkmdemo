const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Extrai dados de uma página web (baseado no padrão extractPageData do LinkMágico original)
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
            validateStatus: s => s >= 200 && s < 400
        });
        html = response.data || '';
        const finalUrl = response.request?.res?.responseUrl || url;
        if (finalUrl && finalUrl !== url) extractedData.url = finalUrl;
    } catch (err) {
        console.warn(`⚠️ Erro ao acessar ${url}: ${err.message}`);
        throw new Error(`Não foi possível acessar a página: ${err.message}`);
    }

    if (!html || html.length < 100) {
        throw new Error('Conteúdo da página muito curto ou vazio');
    }

    try {
        const $ = cheerio.load(html);
        $('script, style, noscript, iframe, svg').remove();

        // Título
        const titleSelectors = ['h1', 'meta[property="og:title"]', 'meta[name="twitter:title"]', 'title'];
        for (const sel of titleSelectors) {
            const el = $(sel).first();
            const t = (el.attr('content') || el.text() || '').trim();
            if (t && t.length > 5 && t.length < 200) { extractedData.title = t; break; }
        }

        // Descrição
        const descSelectors = ['meta[name="description"]', 'meta[property="og:description"]', '.description', 'article p', 'main p'];
        for (const sel of descSelectors) {
            const el = $(sel).first();
            const d = (el.attr('content') || el.text() || '').trim();
            if (d && d.length > 30 && d.length < 1000) { extractedData.description = d; break; }
        }

        // Texto limpo
        const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
        extractedData.cleanText = bodyText.substring(0, 6000);

        // Resumo
        const sentences = bodyText.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 10);
        extractedData.summary = sentences.slice(0, 5).join('. ').substring(0, 500);

        // Preços
        const pricePatterns = [
            /R\$\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?/gi,
            /\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?\s*reais/gi
        ];
        const prices = new Set();
        pricePatterns.forEach(p => {
            const m = bodyText.match(p);
            if (m) m.forEach(price => prices.add(price.trim()));
        });
        extractedData.prices = Array.from(prices).slice(0, 5);

        // Contatos
        const phoneRegex = /(?:\+55\s?)?(?:\(?\d{2}\)?\s?)?\d{4,5}[-.\s]?\d{4}/g;
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
        const whatsRegex = /(?:wa\.me|whatsapp\.com\/send\?phone=)[\d]+/gi;

        const phones = bodyText.match(phoneRegex) || [];
        const emails = bodyText.match(emailRegex) || [];
        const whats = html.match(whatsRegex) || [];

        extractedData.contacts.telefone = [...new Set(phones)].slice(0, 3);
        extractedData.contacts.email = [...new Set(emails)].slice(0, 3);
        extractedData.contacts.whatsapp = [...new Set(whats)].slice(0, 3);

        // CTA (botões de ação)
        const ctaTexts = [];
        $('a, button').each((_, el) => {
            const text = $(el).text().trim();
            const href = $(el).attr('href') || '';
            if (text.length > 3 && text.length < 60 && /compra|assina|ativ|testar|come[cç]|adquir|garanti|inscreva|cadastr|acesse/i.test(text)) {
                ctaTexts.push({ text, href });
            }
        });
        if (ctaTexts.length > 0) extractedData.cta = ctaTexts[0].text;

    } catch (err) {
        console.warn(`⚠️ Erro no parsing: ${err.message}`);
    }

    extractedData.extractionTime = Date.now() - startTime;
    console.log(`✅ Extração concluída: "${extractedData.title}" (${extractedData.cleanText.length} chars, ${extractedData.extractionTime}ms)`);

    return extractedData;
}

module.exports = { extractPageData };
