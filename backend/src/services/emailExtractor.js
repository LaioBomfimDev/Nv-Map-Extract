// ================================================================
// EMAIL EXTRACTOR — Serviço de extração de contatos (Node)
// Porte da lógica da extensão Chrome (extension/js/mybg.js):
// visita o site do lead, extrai e-mails (incl. Cloudflare data-cfemail)
// e links de redes sociais (Instagram, Facebook, LinkedIn, Twitter, YouTube).
// ================================================================

const logger = require('../utils/logger');

const CCTLDS = new Set('ac ad ae af ag ai al am an ao aq ar as at au aw ax az ba bb bd be bf bg bh bi bj bm bn bo br bs bt bv bw by bz ca cc cd cf cg ch ci ck cl cm cn co cr cu cv cw cx cy cz de dj dk dm do dz ec ee eg eh er es et eu fi fj fk fm fo fr ga gb gd ge gf gg gh gi gl gm gn gp gq gr gs gt gu gw gy hk hm hn hr ht hu id ie il im in io iq ir is it je jm jo jp ke kg kh ki km kn kp kr kw ky kz la lb lc li lk lr ls lt lu lv ly ma mc md me mf mg mh mk ml mm mn mo mp mq mr ms mt mu mv mw mx my mz na nc ne nf ng ni nl no np nr nu nz om pa pe pf pg ph pk pl pm pn pr ps pt pw py qa re ro rs ru rw sa sb sc sd se sg sh si sj sk sl sm sn so sr ss st su sv sx sy sz tc td tf tg th tj tk tl tm tn to tr tt tv tw tz ua ug uk us uy uz va vc ve vg vi vn vu wf ws xk ye yt za zm zw'.split(' '));

const BLACKLISTED_PATHS = new Set('/reel /about /tr /privacy /download /pg /settings /vp /profiles'.split(' '));

const SOCIAL_MEDIA_PLATFORMS = {
    instagram: /(((http|https):\/\/)?((www\.)?(?:instagram.com|instagr.am)\/([A-Za-z0-9_.]{2,30})))/ig,
    facebook: /(?:https?:)?\/\/(?:www\.)?(?:facebook|fb)\.com\/((?![A-z]+\.php)(?!marketplace|gaming|watch|me|messages|help|search|groups)[A-z0-9_\-\.]+)\/?/ig,
    youtube: /(?:https?:)?\/\/(?:[A-z]+\.)?youtube\.com\/(channel\/([A-z0-9-_]+)|user\/([A-z0-9]+))\/?/ig,
    linkedin: /(?:https?:)?\/\/(?:[\w]+\.)?linkedin\.com\/((company|school)\/[A-z0-9-À-ÿ\.]+|in\/[\w\-_À-ÿ%]+)\/?/ig,
    twitter: /(?:(?:http|https):\/\/)?(?:www.)?(?:twitter\.com|x\.com)\/(?!(oauth|account|tos|privacy|signup|home|hashtag|search|login|widgets|i|settings|start|share|intent|oct)(['"\?\.\/]|$))([A-Za-z0-9_]{1,15})/igm,
    email: /\b[A-Z0-9._%+-]{1,64}@(?!-)(?:[A-Z0-9-]+\.)+[A-Z]{2,63}\b/gi,
};

const CONTACT_PAGE_PATHS = '/contact /contact-us /contact-me /about /about-me /about-us /team /our-team /meet-the-team /support /customer-service /feedback /help /sales /return /location /faq'.split(' ');

const EMAIL_BLACKLIST = new Set('.png .jpg .jpeg .gif .webp wixpress.com sentry.io noreply abuse no-reply subscribe mailer-daemon domain.com email.com yourname wix.com'.split(' '));

const SOCIAL_MEDIA_DOMAINS = new Set(['instagram', 'facebook', 'youtube', 'linkedin', 'twitter']);

// Decodifica e-mails protegidos pelo Cloudflare (atributo data-cfemail)
function decodeCfEmail(encoded) {
    let out = '';
    const key = parseInt(encoded.slice(0, 2), 16);
    for (let i = 2; i < encoded.length; i += 2) {
        out += String.fromCharCode(parseInt(encoded.slice(i, i + 2), 16) ^ key);
    }
    return out;
}

function getDomain(url) {
    const parts = new URL(url).host.toLowerCase().split('.');
    if (parts.length >= 3 && CCTLDS.has(parts[parts.length - 1])) return parts[parts.length - 3];
    if (parts.length >= 2) return parts[parts.length - 2];
    return parts[0];
}

function normalizeSocialLink(link) {
    try {
        if (link.startsWith('//')) link = 'https:' + link;
        if (!link.startsWith('http')) link = 'https://' + link;
        const u = new URL(link);
        if (u.protocol === 'http:' || u.protocol === '') u.protocol = 'https:';
        if (u.host === 'instagram.com') u.host = 'www.instagram.com';
        if (u.host === 'facebook.com') u.host = 'www.facebook.com';
        if (u.host === 'yelp.com') u.host = 'www.yelp.com';
        if (u.host === 'www.twitter.com') u.host = 'twitter.com';
        if (u.host === 'www.x.com') u.host = 'x.com';
        if (u.pathname.endsWith('/')) u.pathname = u.pathname.slice(0, -1);
        return BLACKLISTED_PATHS.has(u.pathname) ? '' : u.toString();
    } catch (e) {
        return '';
    }
}

async function fetchUrlContent(url, timeoutMs = 10000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            signal: controller.signal,
            redirect: 'follow',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
        });
        if (!res.ok) return '';
        return await res.text();
    } catch (e) {
        logger.warn('Falha ao visitar site do lead', { url, error: e.name === 'AbortError' ? 'timeout' : e.message });
        return '';
    } finally {
        clearTimeout(timer);
    }
}

function emptyResult() {
    return { instagram: new Set(), facebook: new Set(), youtube: new Set(), linkedin: new Set(), twitter: new Set(), email: new Set() };
}

// Visita a URL, extrai contatos; se deepSearch = true, também visita
// páginas internas de contato (/contact, /about, etc.) em busca de e-mails.
async function extractContactsFromUrl(url, deepSearch = true) {
    try {
        if (url.startsWith('//')) url = 'https:' + url;
        if (!url.startsWith('http')) url = 'https://' + url;

        const html = await fetchUrlContent(url);
        if (!html || typeof html !== 'string' || html.length < 10) return emptyResult();

        const content = html.normalize('NFKC');
        const result = emptyResult();

        // 1. Regex direto no HTML para redes sociais e e-mails
        for (const platform in SOCIAL_MEDIA_PLATFORMS) {
            const matches = content.match(SOCIAL_MEDIA_PLATFORMS[platform]);
            if (matches) {
                matches.forEach(m => {
                    if (!m) return;
                    if (platform === 'email') {
                        result.email.add(m);
                    } else {
                        const normalized = normalizeSocialLink(m);
                        if (normalized) result[platform].add(normalized);
                    }
                });
            }
        }

        let baseUrl;
        try {
            baseUrl = new URL(url);
        } catch (e) {
            return result;
        }

        // 2. E-mail protegido por Cloudflare + coleta de todos os hrefs da página
        const allLinks = [];
        const contactPages = new Set();
        try {
            const cf = content.match(/data-cfemail="([a-f0-9]+)"/i);
            if (cf && cf[1]) result.email.add(decodeCfEmail(cf[1]));

            const hrefRegex = /<a[^>]+href=["']([^"']+)["']/gi;
            let m;
            while ((m = hrefRegex.exec(content)) !== null) {
                try {
                    if (m[1]) allLinks.push(new URL(m[1], baseUrl).toString());
                } catch (e) { /* href inválido */ }
            }
        } catch (e) {
            logger.warn('Erro na extração de links', { url, error: e.message });
        }

        // 3. Identificar páginas de contato para busca profunda
        for (const link of allLinks) {
            try {
                const pathname = new URL(link).pathname.toLowerCase();
                if (CONTACT_PAGE_PATHS.some(p => pathname.includes(p))) contactPages.add(link);
            } catch (e) { /* ignora */ }
        }

        // 4. Redes sociais linkadas via <a href>
        for (const link of allLinks) {
            try {
                const host = new URL(link).host.toLowerCase();
                for (const platform of SOCIAL_MEDIA_DOMAINS) {
                    let matchesDomain = false;
                    if (platform === 'twitter') {
                        matchesDomain = host === 'twitter.com' || host === 'www.twitter.com' || host.endsWith('.twitter.com')
                            || host === 'x.com' || host === 'www.x.com' || host.endsWith('.x.com');
                    } else {
                        matchesDomain = host === `${platform}.com` || host === `www.${platform}.com` || host.endsWith(`.${platform}.com`);
                    }
                    if (matchesDomain) {
                        const normalized = normalizeSocialLink(link);
                        if (normalized) result[platform].add(normalized);
                        break;
                    }
                }
            } catch (e) { /* ignora */ }
        }

        // 5. Busca profunda nas páginas de contato (lotes de 10, sem recursão adicional)
        if (deepSearch && contactPages.size > 0) {
            const pages = [...contactPages];
            const subResults = [];
            for (let i = 0; i < pages.length; i += 10) {
                const batch = pages.slice(i, i + 10).map(p => extractContactsFromUrl(p, false));
                subResults.push(...(await Promise.all(batch)));
            }
            subResults.forEach(sub => {
                if (!sub) return;
                for (const key in sub) {
                    if (sub[key] && typeof sub[key].forEach === 'function') {
                        sub[key].forEach(v => result[key].add(v));
                    }
                }
            });
        }

        // 6. Filtrar e-mails: remover lixo e priorizar e-mails do próprio domínio
        const allEmails = new Set();
        const domainEmails = new Set();
        let domain = null;
        try {
            domain = getDomain(url);
        } catch (e) {
            domain = null;
        }
        result.email.forEach(raw => {
            const email = raw.replace('u003e', '').toLowerCase();
            if (Array.from(EMAIL_BLACKLIST).some(b => email.includes(b))) return;
            allEmails.add(email);
            if (domain && email.includes(domain)) domainEmails.add(email);
        });
        result.email = domainEmails.size > 0 ? domainEmails : allEmails;

        return result;
    } catch (e) {
        logger.warn('Erro geral na extração de contatos', { url, error: e.message });
        return emptyResult();
    }
}

// Interface pública: retorna objetos com arrays (prontos para persistir)
async function extractContacts(website, deepSearch = true) {
    const raw = await extractContactsFromUrl(website, deepSearch);
    const out = {};
    for (const key in raw) out[key] = Array.from(raw[key]);
    return out;
}

module.exports = { extractContacts };
