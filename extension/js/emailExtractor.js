// Helpers carregados pelo service worker da extensão.
// Este arquivo não registra listeners; bg.js centraliza o roteamento de mensagens.

const FM_CONTACT_PATHS = [
    '/contact', '/contact-us', '/contact-me',
    '/about', '/about-us', '/team', '/support', '/help',
    '/sales', '/location', '/faq',
];

const FM_EMAIL_BLACKLIST = [
    '.png', '.jpg', '.jpeg', '.gif', '.webp', 'sentry.io',
    'noreply', 'no-reply', 'abuse', 'mailer-daemon',
    'domain.com', 'email.com', 'example.com',
];

function normalizeHttpUrl(value) {
    let raw = String(value || '').trim();
    if (!raw) return '';
    if (raw.startsWith('//')) raw = `https:${raw}`;
    if (!/^[a-z][a-z\d+.-]*:/i.test(raw)) raw = `https://${raw}`;

    try {
        const url = new URL(raw);
        if (!['http:', 'https:'].includes(url.protocol)) return '';
        return url.href;
    } catch (_) {
        return '';
    }
}

function rootDomain(value) {
    try {
        const parts = new URL(value).hostname.toLowerCase().split('.').filter(Boolean);
        if (parts.length <= 2) return parts[0] || '';
        const last = parts[parts.length - 1];
        const prev = parts[parts.length - 2];
        return last.length === 2 && prev.length <= 3 ? parts[parts.length - 3] : prev;
    } catch (_) {
        return '';
    }
}

async function fetchUrlContent(url, timeout = 10000) {
    const safeUrl = normalizeHttpUrl(url);
    if (!safeUrl) return '';

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(safeUrl, {
            signal: controller.signal,
            redirect: 'follow',
            headers: {
                accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
        });
        if (!response.ok) return '';
        const type = response.headers.get('content-type') || '';
        if (type && !/text|html|xml|json/i.test(type)) return '';
        return await response.text();
    } catch (_) {
        return '';
    } finally {
        clearTimeout(timer);
    }
}

function decodeCfEmail(hex) {
    let out = '';
    const key = parseInt(hex.slice(0, 2), 16);
    for (let i = 2; i < hex.length; i += 2) {
        out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
    }
    return out;
}

function normalizeSocialUrl(raw) {
    const safeUrl = normalizeHttpUrl(raw);
    if (!safeUrl) return '';

    try {
        const url = new URL(safeUrl);
        url.hash = '';
        const host = url.hostname.toLowerCase().replace(/^m\./, 'www.');
        url.hostname = host === 'facebook.com' || host === 'instagram.com' ? `www.${host}` : host;
        if (url.pathname.endsWith('/')) url.pathname = url.pathname.slice(0, -1);

        const blockedPaths = new Set([
            '/share', '/intent', '/privacy', '/terms', '/login', '/signup',
            '/reel', '/about', '/help', '/search', '/watch',
        ]);
        return blockedPaths.has(url.pathname.toLowerCase()) ? '' : url.href;
    } catch (_) {
        return '';
    }
}

function addMatchesFromHtml(html, baseUrl, out) {
    const text = String(html || '').normalize('NFKC');
    const emailMatches = text.match(/\b[A-Z0-9._%+-]{1,64}@(?!-)(?:[A-Z0-9-]+\.)+[A-Z]{2,63}\b/gi) || [];
    emailMatches.forEach(email => {
        const lower = email.toLowerCase().replace(/u003e/g, '');
        if (!FM_EMAIL_BLACKLIST.some(blocked => lower.includes(blocked))) out.email.add(lower);
    });

    const cf = text.match(/data-cfemail=["']([a-f0-9]+)["']/i);
    if (cf && cf[1]) out.email.add(decodeCfEmail(cf[1]).toLowerCase());

    const socialPatterns = {
        instagram: /(?:https?:)?\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9_.-]+\/?/ig,
        facebook: /(?:https?:)?\/\/(?:www\.)?(?:facebook|fb)\.com\/[A-Za-z0-9_.-]+\/?/ig,
        linkedin: /(?:https?:)?\/\/(?:[\w-]+\.)?linkedin\.com\/(?:company|in)\/[A-Za-z0-9_.-]+\/?/ig,
        twitter: /(?:https?:)?\/\/(?:www\.)?(?:twitter|x)\.com\/[A-Za-z0-9_]{1,15}\/?/ig,
        youtube: /(?:https?:)?\/\/(?:www\.)?youtube\.com\/(?:@|channel\/|c\/|user\/)[A-Za-z0-9_.-]+\/?/ig,
    };

    Object.entries(socialPatterns).forEach(([key, pattern]) => {
        const matches = text.match(pattern) || [];
        matches.forEach(match => {
            const normalized = normalizeSocialUrl(match);
            if (normalized) out[key].add(normalized);
        });
    });

    const links = [];
    const linkPattern = /<a[^>]+href=["']([^"']+)["']/gi;
    let match;
    while ((match = linkPattern.exec(text))) {
        try {
            links.push(new URL(match[1], baseUrl).href);
        } catch (_) {}
    }
    return links;
}

async function extractemail(website, name = '', deepSearch = false) {
    const startUrl = normalizeHttpUrl(website);
    const out = {
        instagram: new Set(),
        facebook: new Set(),
        youtube: new Set(),
        linkedin: new Set(),
        twitter: new Set(),
        email: new Set(),
    };
    if (!startUrl) return out;

    const html = await fetchUrlContent(startUrl);
    if (!html) return out;

    const links = addMatchesFromHtml(html, startUrl, out);

    if (deepSearch) {
        const base = new URL(startUrl);
        const contactLinks = links
            .filter(link => {
                try {
                    const url = new URL(link);
                    return url.hostname === base.hostname &&
                        FM_CONTACT_PATHS.some(path => url.pathname.toLowerCase().startsWith(path));
                } catch (_) {
                    return false;
                }
            })
            .slice(0, 5);

        const pages = await Promise.all(contactLinks.map(link => fetchUrlContent(link, 7000)));
        pages.forEach((page, i) => addMatchesFromHtml(page, contactLinks[i], out));
    }

    const domain = rootDomain(startUrl);
    const domainEmails = new Set([...out.email].filter(email => domain && email.includes(domain)));
    if (domainEmails.size) out.email = domainEmails;

    return out;
}
