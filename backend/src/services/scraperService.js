// ================================================================
// SCRAPER SERVICE — Busca no Google Maps via Puppeteer
// Substitui a extensão Chrome: abre o Maps no backend, pesquisa,
// rola o painel lateral, intercepta as respostas XHR de /search e
// salva os leads no banco em tempo real (com enriquecimento de e-mail).
// ================================================================

const dataService = require('./dataService');
const emailExtractor = require('./emailExtractor');
const logger = require('../utils/logger');

const MAX_LOGS = 100;
const MAX_RECENT_LEADS = 15;
const EMAIL_CONCURRENCY = 3;

// Estado compartilhado da busca atual (consultado via GET /api/scraper/status)
const state = {
    status: 'idle', // idle | starting | running | stopping | done | error
    phase: '',
    keyword: '',
    city: '',
    searchId: null,
    searchName: '',
    leadsFound: 0,
    emailsFound: 0,
    startedAt: null,
    finishedAt: null,
    error: null,
    logs: [],
    recentLeads: [],
};

let browser = null;
let stopRequested = false;
let seenPlaceIds = new Set();
let emailQueue = [];
let emailWorkersRunning = 0;
let pendingEmailJobs = 0;

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function addLog(message) {
    state.logs.push({ time: new Date().toISOString(), message });
    if (state.logs.length > MAX_LOGS) state.logs.splice(0, state.logs.length - MAX_LOGS);
    logger.info(`[Scraper] ${message}`);
}

function setPhase(phase) {
    state.phase = phase;
}

function getStatus() {
    return {
        ...state,
        logs: state.logs.slice(-50),
        pendingEmails: pendingEmailJobs,
        isActive: state.status === 'starting' || state.status === 'running' || state.status === 'stopping',
    };
}

// ——— Localização recursiva do array de estabelecimentos no JSON do Maps ———
// Portada do content script da extensão (findFeedArray): resiliente a
// mudanças de posição no payload, valida placeID (e[78]) e nome (e[11]).
function findFeedArray(obj) {
    if (!obj || typeof obj !== 'object') return null;

    if (Array.isArray(obj)) {
        let matchCount = 0;
        for (let i = 0; i < obj.length; i++) {
            const item = obj[i];
            if (Array.isArray(item) && item.length > 0) {
                const e = item[item.length - 1];
                if (e && Array.isArray(e)) {
                    const placeId = e[78];
                    const name = e[11];
                    const isPlaceId = typeof placeId === 'string' && (placeId.startsWith('ChI') || (placeId.length > 15 && placeId.length < 50 && /^[A-Za-z0-9_-]+$/.test(placeId)));
                    const isName = typeof name === 'string' && name.length > 0;
                    if (isPlaceId && isName) matchCount++;
                }
            }
        }
        if (matchCount > 0) return obj;

        for (let i = 0; i < obj.length; i++) {
            const found = findFeedArray(obj[i]);
            if (found) return found;
        }
    } else {
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                const found = findFeedArray(obj[key]);
                if (found) return found;
            }
        }
    }
    return null;
}

// Converte um item do feed em lead (mesmos índices usados pela extensão)
function parseLeadEntry(entry) {
    const e = entry[entry.length - 1];
    if (!e || !Array.isArray(e)) return null;

    const placeID = e[78] || '';
    if (!placeID) return null;

    let name = ''; try { name = e[11] || ''; } catch (_) {}
    if (!name) return null;

    let website = '';    try { website = e[7][0] || ''; } catch (_) {}
    let phone = '';      try { phone = e[178][0][0] || ''; } catch (_) {}
    let reviewCount = 0; try { reviewCount = e[4][8] || 0; } catch (_) {}
    let avgRating = 0;   try { avgRating = e[4][7] || 0; } catch (_) {}
    let category = '';   try { category = (e[13] || []).join('; ') || ''; } catch (_) {}
    let cID = '';        try { cID = e[37][0][0][29][1] || ''; } catch (_) {}
    let address = '';    try { address = (e[2] || []).join(', ') || ''; } catch (_) {}
    let lat = 0;         try { lat = e[9][2] || 0; } catch (_) {}
    let lng = 0;         try { lng = e[9][3] || 0; } catch (_) {}

    return {
        name, phone, website, address, email: '',
        placeID, cID, category, reviewCount, averageRating: avgRating,
        latitude: lat, longitude: lng,
        instagram: '', facebook: '', linkedin: '', twitter: '', youtube: '',
    };
}

// Extrai o JSON de uma resposta do endpoint de busca do Maps.
// O corpo vem como /*""*/{"d":")]}'\n[[...]]", ...} ou direto como )]}'\n[[...]]
function parseSearchResponseBody(body) {
    if (!body || typeof body !== 'string') return null;
    try {
        let payload = body.replace('/*""*/', '').trim();
        if (payload.startsWith('{')) {
            const wrapper = JSON.parse(payload);
            if (!wrapper.d) return null;
            payload = wrapper.d;
        }
        const start = payload.indexOf('[');
        if (start === -1) return null;
        return JSON.parse(payload.slice(start));
    } catch (e) {
        return null;
    }
}

// ——— Fila de enriquecimento de e-mails/redes sociais ———————————————
function enqueueEmailJob(lead) {
    if (!lead.website) return;
    emailQueue.push(lead);
    pendingEmailJobs++;
    while (emailWorkersRunning < EMAIL_CONCURRENCY && emailQueue.length > 0) {
        runEmailWorker();
    }
}

async function runEmailWorker() {
    emailWorkersRunning++;
    try {
        while (emailQueue.length > 0 && !stopRequested) {
            const lead = emailQueue.shift();
            try {
                setPhase(`Extraindo contatos de ${lead.name}...`);
                const contacts = await emailExtractor.extractContacts(lead.website, true);
                const enriched = {
                    ...lead,
                    email: (contacts.email || []).join(', '),
                    instagram: (contacts.instagram || []).join(', '),
                    facebook: (contacts.facebook || []).join(', '),
                    linkedin: (contacts.linkedin || []).join(', '),
                    twitter: (contacts.twitter || []).join(', '),
                    youtube: (contacts.youtube || []).join(', '),
                };
                if (enriched.email) {
                    state.emailsFound++;
                    addLog(`📧 E-mail encontrado para "${lead.name}": ${enriched.email}`);
                }
                // Regrava o lead: a lógica de mesclagem do dataService preenche os campos novos
                if (state.searchId) {
                    await dataService.saveResults(state.searchId, [enriched]);
                }
                const recent = state.recentLeads.find(l => l.placeID === lead.placeID);
                if (recent) {
                    recent.email = enriched.email;
                    recent.instagram = enriched.instagram;
                }
            } catch (e) {
                logger.warn('Erro ao enriquecer lead', { name: lead.name, error: e.message });
            } finally {
                pendingEmailJobs--;
            }
        }
    } finally {
        emailWorkersRunning--;
    }
}

// ——— Processamento de um lote de leads interceptado ————————————————
async function processInterceptedResponse(body, collectEmails) {
    const parsed = parseSearchResponseBody(body);
    if (!parsed) return;

    const feed = findFeedArray(parsed);
    if (!feed) return;

    const newLeads = [];
    for (let k = 0; k < feed.length; k++) {
        try {
            if (!Array.isArray(feed[k])) continue;
            const lead = parseLeadEntry(feed[k]);
            if (!lead || seenPlaceIds.has(lead.placeID)) continue;
            seenPlaceIds.add(lead.placeID);
            newLeads.push(lead);
        } catch (e) { /* item malformado — segue para o próximo */ }
    }

    if (newLeads.length === 0) return;

    state.leadsFound += newLeads.length;
    newLeads.forEach(l => {
        state.recentLeads.unshift({ name: l.name, phone: l.phone, website: l.website, address: l.address, email: '', instagram: '', placeID: l.placeID });
    });
    state.recentLeads.splice(MAX_RECENT_LEADS);
    addLog(`⚡ ${newLeads.length} novos leads capturados (total: ${state.leadsFound})`);

    // Persistência em tempo real
    if (state.searchId) {
        try {
            await dataService.saveResults(state.searchId, newLeads);
            await dataService.updateSearchTotals(state.searchId, state.leadsFound, 'running');
        } catch (e) {
            logger.error('Erro ao salvar leads no banco', { error: e.message });
        }
    }

    if (collectEmails) {
        newLeads.forEach(l => enqueueEmailJob(l));
    }
}

// ——— Ciclo principal da busca ———————————————————————————————————————
async function runScrape({ keyword, city, collectEmails, showBrowser }) {
    let puppeteer;
    try {
        puppeteer = require('puppeteer');
    } catch (e) {
        throw new Error('Puppeteer não instalado. Execute "npm install" na pasta backend.');
    }

    setPhase('Iniciando navegador...');
    addLog(`🚀 Iniciando busca: "${keyword}" em "${city}"${collectEmails ? ' (com coleta de e-mails)' : ''}`);

    browser = await puppeteer.launch({
        headless: !showBrowser,
        defaultViewport: showBrowser ? null : { width: 1366, height: 900 },
        args: [
            '--lang=pt-BR',
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--disable-blink-features=AutomationControlled',
            // WebGL via software: sem isso o Google entrega a versão "lite" do Maps em headless
            '--enable-unsafe-swiftshader',
            '--use-gl=angle',
            '--use-angle=swiftshader',
        ],
    });

    const page = await browser.newPage();
    // Remove "HeadlessChrome" do user-agent (também dispara a versão lite do Maps)
    const ua = (await browser.userAgent()).replace('HeadlessChrome', 'Chrome');
    await page.setUserAgent(ua);
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8' });

    // Interceptar respostas XHR de busca do Maps
    page.on('response', async (response) => {
        try {
            const url = response.url();
            if (!url.includes('/search') || !url.includes('tbm=map')) return;
            const body = await response.text();
            await processInterceptedResponse(body, collectEmails);
        } catch (e) { /* respostas de preflight/redirect não têm corpo */ }
    });

    // Navegar direto para a URL de busca (dispensa interação com a caixa de pesquisa)
    setPhase('Pesquisando no Maps...');
    const query = `${keyword} em ${city}`;
    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}?hl=pt-BR`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    addLog(`🔎 Pesquisa enviada: "${query}"`);

    // Tela de consentimento (aparece em alguns ambientes)
    try {
        const consentBtn = await page.$('button[aria-label*="ceitar"], #L2AGLb, form[action*="consent"] button');
        if (consentBtn) {
            await consentBtn.click();
            await sleep(2000);
        }
    } catch (e) { /* sem tela de consentimento */ }

    if (stopRequested) return;

    // Aguardar o painel lateral de resultados
    try {
        await page.waitForSelector('[role="feed"]', { timeout: 30000 });
    } catch (e) {
        // Pode ter caído direto em um único estabelecimento (sem lista)
        addLog('⚠️ Painel de resultados não apareceu — a pesquisa pode ter retornado um único local.');
        await sleep(3000);
        return;
    }

    if (stopRequested) return;

    state.status = 'running';
    setPhase('Rolando lista de resultados...');

    // Rolagem gradual do feed simulando comportamento humano
    let stall = 0;
    let lastHeight = await page.evaluate(() => document.querySelector('[role="feed"]')?.scrollHeight || 0);

    while (!stopRequested) {
        // Rola em 4 passos suaves até o fim atual do painel
        await page.evaluate(async () => {
            const feed = document.querySelector('[role="feed"]');
            if (!feed) return;
            const sleep = (ms) => new Promise(r => setTimeout(r, ms));
            const current = feed.scrollTop;
            const target = feed.scrollHeight;
            const steps = 4;
            const delta = (target - current) / steps;
            for (let i = 1; i <= steps; i++) {
                feed.scrollTop = current + delta * i;
                await sleep(200);
            }
        });

        const wait = 1000 * (Math.floor(Math.random() * 2) + 1.5);
        await sleep(wait);

        // Indicadores do Google de fim da lista
        const reachedEnd = await page.evaluate(() =>
            Boolean(document.querySelector('.HlvSq') || document.querySelector('.m67Ao') || document.querySelector('.wDp5Ae'))
        );
        if (reachedEnd) {
            addLog(`✅ Fim dos resultados detectado. ${state.leadsFound} leads capturados.`);
            break;
        }

        const height = await page.evaluate(() => document.querySelector('[role="feed"]')?.scrollHeight || 0);
        if (height === lastHeight) {
            stall++;
            if (stall > 15) {
                addLog(`✅ Lista estagnada — fim assumido. ${state.leadsFound} leads capturados.`);
                break;
            }
        } else {
            stall = 0;
            lastHeight = height;
        }

        setPhase(`Rolando lista... ${state.leadsFound} leads encontrados`);
    }
}

async function start({ keyword, city, collectEmails = true, showBrowser = false }) {
    if (getStatus().isActive) {
        throw new Error('Já existe uma busca em andamento. Pare a busca atual antes de iniciar outra.');
    }

    // Reset do estado
    stopRequested = false;
    seenPlaceIds = new Set();
    emailQueue = [];
    pendingEmailJobs = 0;
    state.status = 'starting';
    state.phase = 'Preparando...';
    state.keyword = keyword;
    state.city = city;
    state.leadsFound = 0;
    state.emailsFound = 0;
    state.startedAt = new Date().toISOString();
    state.finishedAt = null;
    state.error = null;
    state.logs = [];
    state.recentLeads = [];

    const safe = (s) => String(s).trim().replace(/[^\p{L}\p{N}]+/gu, '_').toLowerCase();
    state.searchName = `scraper_${safe(keyword)}_${safe(city)}_${Date.now()}`;

    const search = await dataService.createSearch(state.searchName, keyword, city, 'scraper');
    state.searchId = search.id;

    // Executa em segundo plano — o controller responde imediatamente
    (async () => {
        try {
            await runScrape({ keyword, city, collectEmails, showBrowser });

            // Aguardar fila de e-mails terminar (ou parada forçada)
            if (collectEmails && pendingEmailJobs > 0 && !stopRequested) {
                setPhase(`Extraindo e-mails... (${pendingEmailJobs} sites restantes)`);
                addLog(`📬 Aguardando enriquecimento de ${pendingEmailJobs} leads com site...`);
                while (pendingEmailJobs > 0 && !stopRequested) {
                    setPhase(`Extraindo e-mails... (${pendingEmailJobs} sites restantes)`);
                    await sleep(1000);
                }
            }

            await finalize(stopRequested ? 'stopped' : 'done');
        } catch (e) {
            // O fechamento do navegador via stop() derruba as chamadas em andamento — não é erro real
            if (stopRequested) {
                await finalize('stopped');
            } else {
                logger.error('Erro na execução do scraper', { error: e.message, stack: e.stack });
                state.error = e.message;
                addLog(`❌ Erro: ${e.message}`);
                await finalize('error');
            }
        }
    })();

    return { searchId: state.searchId, searchName: state.searchName };
}

async function finalize(outcome) {
    setPhase(outcome === 'done' ? 'Finalizado' : outcome === 'stopped' ? 'Interrompido' : 'Erro');
    state.status = outcome === 'error' ? 'error' : 'done';
    state.finishedAt = new Date().toISOString();

    if (state.searchId) {
        try {
            await dataService.updateSearchTotals(state.searchId, state.leadsFound, outcome === 'error' ? 'error' : 'completed');
        } catch (e) {
            logger.error('Erro ao atualizar totais da busca', { error: e.message });
        }
    }

    if (browser) {
        try { await browser.close(); } catch (e) { /* já fechado */ }
        browser = null;
    }

    if (outcome === 'done') addLog(`🏁 Busca finalizada: ${state.leadsFound} leads, ${state.emailsFound} e-mails.`);
    if (outcome === 'stopped') addLog(`⏹ Busca interrompida pelo usuário: ${state.leadsFound} leads salvos.`);
}

async function stop() {
    if (!getStatus().isActive) {
        return { stopped: false, message: 'Nenhuma busca em andamento.' };
    }
    state.status = 'stopping';
    setPhase('Parando busca...');
    stopRequested = true;
    emailQueue = [];

    // Fecha o navegador imediatamente para abortar navegação/rolagem
    if (browser) {
        try { await browser.close(); } catch (e) { /* já fechado */ }
        browser = null;
    }

    return { stopped: true, leadsFound: state.leadsFound };
}

module.exports = { start, stop, getStatus };
