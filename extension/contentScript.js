// ================================================================
// MAPS SEARCH EXTRACTOR — Content Script Principal
// Interface flutuante no Google Maps + captura inteligente de leads
// ================================================================

var auto_extract_flag = false;
var leads = [];
var leads_lnglat = new Set();
var collect_email = true;

// ——— Criar interface flutuante ———————————————————————————————————
(function () {
    const container = document.createElement('div');
    container.className = 'mse_panel';

    // Cabeçalho
    const header = document.createElement('div');
    header.className = 'mse_header';
    header.innerHTML = `
        <div class="mse_logo">
            <span class="mse_logo_icon">🗺️</span>
            <div>
                <div class="mse_logo_title">Maps Search</div>
                <div class="mse_logo_sub">Extractor</div>
            </div>
        </div>
        <div id="mse_leads_count" class="mse_badge">0 leads</div>
    `;

    // Botões
    const btnStart = document.createElement('button');
    btnStart.className = 'mse_btn mse_btn_primary';
    btnStart.id = 'mse_start_btn';
    btnStart.innerHTML = '▶ Iniciar Extração';

    const btnSend = document.createElement('button');
    btnSend.className = 'mse_btn mse_btn_send';
    btnSend.id = 'mse_send_btn';
    btnSend.innerHTML = '📤 Enviar ao Dashboard';

    const btnExport = document.createElement('button');
    btnExport.className = 'mse_btn mse_btn_export';
    btnExport.id = 'mse_export_btn';
    btnExport.innerHTML = '⬇️ Exportar CSV';

    const btnClear = document.createElement('button');
    btnClear.className = 'mse_btn mse_btn_clear';
    btnClear.id = 'mse_clear_btn';
    btnClear.innerHTML = '🗑️ Limpar';

    // Status
    const statusEl = document.createElement('div');
    statusEl.id = 'mse_status';
    statusEl.className = 'mse_status';

    container.appendChild(header);
    container.appendChild(btnStart);
    container.appendChild(btnSend);
    container.appendChild(btnExport);
    container.appendChild(btnClear);
    container.appendChild(statusEl);

    // Inserir painel no DOM (Google Maps)
    setInterval(() => {
        const root = document.getElementsByClassName('w6VYqd')[0];
        if (root && !root.contains(container)) {
            root.appendChild(container);
        }
    }, 2000);

    // ——— Ações dos botões ———————————————————————————————————————

    // INICIAR / PARAR extração
    btnStart.addEventListener('click', async () => {
        if (auto_extract_flag) {
            // Parar
            auto_extract_flag = false;
            btnStart.innerHTML = '▶ Iniciar Extração';
            btnStart.classList.remove('mse_btn_stop');
            setStatus('Extração parada.', 'neutral');
            return;
        }

        // Iniciar
        auto_extract_flag = true;
        btnStart.innerHTML = '⏹ Parar Extração';
        btnStart.classList.add('mse_btn_stop');
        setStatus('Iniciando...', 'info');

        // Clicar no botão de pesquisa do Maps para garantir que a lista carregou
        const searchBtn = document.querySelector('[role="search"] button');
        if (searchBtn) {
            searchBtn.click();
            await sleep(2500);
        }

        // Encontrar container rolável do feed
        let feed = document.querySelector('[role="feed"]');
        if (!feed) {
            // Fallback inteligente: buscar a maior div com scroll vertical ativo
            const scrollableDivs = Array.from(document.querySelectorAll('div')).filter(el => {
                const style = window.getComputedStyle(el);
                return (style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight;
            });
            if (scrollableDivs.length > 0) {
                feed = scrollableDivs.sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
            }
        }

        if (!feed) {
            setStatus('❌ Painel lateral não detectado', 'error');
            auto_extract_flag = false;
            btnStart.innerHTML = '▶ Iniciar Extração';
            btnStart.classList.remove('mse_btn_stop');
            return;
        }

        let stall = 0;
        let lastHeight = feed.scrollHeight;

        while (auto_extract_flag) {
            // Rolar gradualmente para simular rolagem humana e acionar o lazy loading do Maps
            const currentScroll = feed.scrollTop;
            const targetScroll = feed.scrollHeight;
            const steps = 4;
            const stepDelta = (targetScroll - currentScroll) / steps;
            
            for (let i = 1; i <= steps && auto_extract_flag; i++) {
                feed.scrollTop = currentScroll + (stepDelta * i);
                await sleep(200);
            }

            const wait = 1000 * (Math.floor(Math.random() * 2) + 1.5);
            await sleep(wait);

            // Verificar se chegou ao fim da lista (indicador do Google)
            if (document.querySelector('.HlvSq') || document.querySelector('.m67Ao') || document.querySelector('.wDp5Ae')) {
                setStatus(`✅ Fim dos resultados! ${leads.length} leads`, 'success');
                break;
            }

            if (lastHeight === feed.scrollHeight) {
                stall++;
                if (stall > 15) {
                    setStatus(`✅ Fim da lista detectado. ${leads.length} leads`, 'success');
                    break;
                }
            } else {
                stall = 0;
                lastHeight = feed.scrollHeight;
            }

            setStatus(`⚡ Extraindo... ${leads.length} leads capturados`, 'info');
        }

        auto_extract_flag = false;
        btnStart.innerHTML = '▶ Iniciar Extração';
        btnStart.classList.remove('mse_btn_stop');

        // Rede de segurança: se a interceptação não trouxe nada, lê direto da tela.
        if (leads.length === 0) {
            setStatus('🔎 Interceptação vazia — tentando captura direta da tela...', 'info');
            const n = ingestLeads(extractFromDOM());
            console.log(`[MSE] Fallback DOM: +${n} leads.`);
            updateCount(leads.length);
        }

        // Envio AUTOMÁTICO ao terminar (sem precisar clicar em "Enviar").
        if (leads.length > 0) {
            setStatus(`⏳ Enriquecendo e enviando ${leads.length} leads...`, 'info');
            await sleep(6000); // dá tempo do enriquecimento de e-mail/redes assentar
            await doSend({ auto: window.location.hash.includes('fm_auto') });
        }
    });

    // ENVIAR AO DASHBOARD (manual — o envio já é automático ao terminar a extração)
    btnSend.addEventListener('click', () => doSend({ auto: false }));

    // Envia os leads ao painel (Supabase, via bg.js). Reutilizado pelo auto-envio.
    async function doSend({ auto = false } = {}) {
        if (leads.length === 0) {
            setStatus('⚠️ Nenhum lead para enviar.', 'warning');
            return;
        }
        setStatus(`📤 Enviando ${leads.length} leads para o Dashboard...`, 'info');
        btnSend.disabled = true;

        const searchInput = document.querySelector('input[aria-label]');
        const kw = searchInput?.value || document.title || 'maps_search';
        const urlMatch = window.location.href.match(/search\/([^/?#]+)/);
        const searchTerm = urlMatch ? decodeURIComponent(urlMatch[1]).replace(/\+/g, ' ') : kw;

        return new Promise((resolve) => {
            chrome.runtime.sendMessage({
                action: 'sendToDashboard',
                data: { leads, keyword: searchTerm, city: '' },
            }, (response) => {
                btnSend.disabled = false;
                if (response?.success) {
                    setStatus(`✅ ${response.message || leads.length + ' leads enviados!'}`, 'success');
                } else {
                    setStatus(`❌ Falha: ${response?.message || 'Erro de conexão'}`, 'error');
                }
                // Fluxo automático (janela pop-up disparada pelo site): fechar a janela.
                if (auto) {
                    try { chrome.runtime.sendMessage({ action: 'fmSearchDone', ok: !!(response && response.success) }); } catch (_) {}
                }
                resolve(response);
            });
        });
    }

    // EXPORTAR CSV
    btnExport.addEventListener('click', () => {
        if (leads.length === 0) {
            setStatus('⚠️ Nenhum lead para exportar.', 'warning');
            return;
        }
        chrome.runtime.sendMessage({ action: 'openPage', data: leads });
    });

    // LIMPAR
    btnClear.addEventListener('click', () => {
        leads = [];
        leads_lnglat.clear();
        updateCount(0);
        setStatus('🗑️ Leads limpos.', 'neutral');
    });

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    function setStatus(msg, type = 'neutral') {
        statusEl.textContent = msg;
        statusEl.className = `mse_status mse_status_${type}`;
    }

    function updateCount(n) {
        const countBadge = document.getElementById('mse_leads_count');
        if (countBadge) countBadge.textContent = `${n} leads`;
    }

    window._mse_updateCount = updateCount;

    // Início AUTOMÁTICO quando a busca é disparada pelo site (janela pop-up com #fm_auto).
    if (window.location.hash.includes('fm_auto')) {
        (async () => {
            await sleep(3500); // espera o painel do Maps carregar
            if (!auto_extract_flag) btnStart.click();
        })();
    }

    // Comando vindo do bg.js (site → bg → aqui) para iniciar a extração.
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg && msg.action === 'fmAutoExtract' && !auto_extract_flag) btnStart.click();
        return false;
    });
})();

// ——— Helpers de extração de emails e redes sociais ——————————————————
function decode_cf_email(a) {
    let s = '';
    const r = parseInt(a.substr(0, 2), 16);
    for (let j = 2; j < a.length; j += 2) {
        s += String.fromCharCode(parseInt(a.substr(j, 2), 16) ^ r);
    }
    return s;
}

function get_domain(a) {
    const tlds = new Set('ac ad ae af ag ai al am an ao aq ar as at au aw ax az ba bb bd be bf bg bh bi bj bm bn bo br bs bt bv bw by bz ca cc cd cf cg ch ci ck cl cm cn co cr cu cv cw cx cy cz de dj dk dm do dz ec ee eg eh er es et eu fi fj fk fm fo fr ga gb gd ge gf gg gh gi gl gm gn gp gq gr gs gt gu gw gy hk hm hn hr ht hu id ie il im in io iq ir is it je jm jo jp ke kg kh ki km kn kp kr kw ky kz la lb lc li lk lr ls lt lu lv ly ma mc md me mf mg mh mk ml mm mn mo mp mq mr ms mt mu mv mw mx my mz na nc ne nf ng ni nl no np nr nu nz om pa pe pf pg ph pk pl pm pn pr ps pt pw py qa re ro rs ru rw sa sb sc sd se sg sh si sj sk sl sm sn so sr ss st su sv sx sy sz tc td tf tg th tj tk tl tm tn to tr tt tv tw tz ua ug uk us uy uz va vc ve vg vi vn vu wf ws xk ye yt za zm zw'.split(' '));
    const parts = (new URL(a)).host.toLowerCase().split('.');
    return tlds.has(parts[parts.length - 1]) ? parts[parts.length - 3] : parts[parts.length - 2];
}

function normalize_social_link(a) {
    try {
        if (a.startsWith('//')) a = 'https:' + a;
        if (!a.startsWith('http')) a = 'https://' + a;
        const blocked = new Set('/reel /about /tr /privacy /download /pg /settings /vp /profiles'.split(' '));
        const u = new URL(a);
        if (u.protocol === 'http:') u.protocol = 'https:';
        if (u.host === 'instagram.com') u.host = 'www.instagram.com';
        if (u.host === 'facebook.com') u.host = 'www.facebook.com';
        if (u.pathname.endsWith('/')) u.pathname = u.pathname.slice(0, -1);
        return blocked.has(u.pathname) ? '' : u.toString();
    } catch (e) { return ''; }
}

// ——— Função recursiva inteligente para localizar o array do feed —————
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
                    if (isPlaceId && isName) {
                        matchCount++;
                    }
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

// ——— Parser tolerante das respostas /search (cobre formatos diferentes) ———
function parseSearchPayload(text) {
    // Formato A: /*""*/{"d":")]}'\n[...]"}
    try {
        const obj = JSON.parse(text.replace('/*""*/', ''));
        if (obj && typeof obj.d === 'string') {
            const i = obj.d.indexOf('[');
            if (i >= 0) return JSON.parse(obj.d.slice(i));
        }
    } catch (_) {}
    // Formato B: )]}'\n[...]  (resposta direta, sem embrulho)
    try {
        const i = text.indexOf('[');
        if (i >= 0) return JSON.parse(text.slice(i));
    } catch (_) {}
    return null;
}

// ——— Adiciona leads (dedup) e dispara enriquecimento de e-mail/redes ———
function ingestLeads(newLeads) {
    if (!newLeads || !newLeads.length) return 0;
    let added = 0;
    for (const lead of newLeads) {
        const key = lead.placeID || (lead.name + '|' + lead.address);
        if (!key || leads_lnglat.has(key)) continue;
        leads_lnglat.add(key);
        leads.push(lead);
        added++;
        (async () => {
            try {
                if (lead.website && collect_email) {
                    const d = await chrome.runtime.sendMessage({ action: 'email', data: { website: lead.website, name: lead.name, deep_search: true } });
                    if (d) {
                        const idx = leads.findIndex(l => (l.placeID || '') === (lead.placeID || '') && l.name === lead.name);
                        if (idx !== -1) for (const k in d) leads[idx][k] = Array.isArray(d[k]) ? d[k].join(', ') : d[k];
                    }
                }
            } catch (_) {}
        })();
    }
    if (added && window._mse_updateCount) window._mse_updateCount(leads.length);
    return added;
}

// ——— Rede de segurança: captura direto do DOM se a interceptação vier vazia ———
function extractFromDOM() {
    const out = [];
    const seen = new Set();
    document.querySelectorAll('div[role="feed"] a[href*="/maps/place/"], a.hfpxzc').forEach((a) => {
        const name = (a.getAttribute('aria-label') || '').trim();
        if (!name || seen.has(name)) return;
        seen.add(name);
        const card = a.closest('div[jsaction]') || a.parentElement;
        let phone = '', website = '', category = '', rating = 0;
        if (card) {
            const txt = card.innerText || '';
            const ph = txt.match(/(?:\(?\d{2}\)?[\s-]?)?\d{4,5}[\s-]\d{4}/);
            if (ph) phone = ph[0];
            const site = card.querySelector('a[data-value="Website"], a[href^="http"]:not([href*="google."]):not([href*="maps."])');
            if (site) website = site.href;
            const rt = card.querySelector('.MW4etd');
            if (rt) rating = parseFloat((rt.textContent || '').replace(',', '.')) || 0;
        }
        out.push({ name, phone, website, address: '', email: '', placeID: '', cID: '', category, reviewCount: 0, averageRating: rating, latitude: 0, longitude: 0, instagram: '', facebook: '', linkedin: '', twitter: '', youtube: '' });
    });
    return out;
}

// ——— Listener das respostas do Google Maps (XHR + fetch interceptados) ———
window.addEventListener('message', function (event) {
    if (!event.data || event.data.type !== 'search' || !event.data.data) return;

    const results = parseSearchPayload(event.data.data);
    if (!results) { console.warn('[MSE] Resposta /search recebida, mas formato não reconhecido.'); return; }

    const feed = findFeedArray(results);
    if (!feed) { console.warn('[MSE] Feed de estabelecimentos não localizado no payload.'); return; }
    console.log(`[MSE] Feed interceptado: ${feed.length} itens.`);

    const newLeads = [];
    for (let k = 0; k < feed.length; k++) {
        try {
            const e = feed[k][feed[k].length - 1];
            if (!e || !Array.isArray(e)) continue;

            const placeID = e[78] || '';
            if (!placeID) continue;

            let name = ''; try { name = e[11] || ''; } catch (_) {}
            if (!name) continue;

            let website = '';    try { website = e[7][0] || ''; } catch (_) {}
            let phone = '';      try { phone = e[178][0][0] || ''; } catch (_) {}
            let reviewCount = 0; try { reviewCount = e[4][8] || 0; } catch (_) {}
            let avgRating = 0;   try { avgRating = e[4][7] || 0; } catch (_) {}
            let category = '';   try { category = (e[13] || []).join('; ') || ''; } catch (_) {}
            let cID = '';        try { cID = e[37][0][0][29][1] || ''; } catch (_) {}
            let address = '';    try { address = (e[2] || []).join(', ') || ''; } catch (_) {}
            let lat = 0;         try { lat = e[9][2] || 0; } catch (_) {}
            let lng = 0;         try { lng = e[9][3] || 0; } catch (_) {}

            newLeads.push({
                name, phone, website, address, email: '',
                placeID, cID, category, reviewCount, averageRating: avgRating,
                latitude: lat, longitude: lng,
                instagram: '', facebook: '', linkedin: '', twitter: '', youtube: '',
            });
        } catch (err) {
            console.warn('[MSE] Erro ao processar estabelecimento individual:', err);
        }
    }

    const added = ingestLeads(newLeads);
    console.log(`[MSE] +${added} novos leads (total: ${leads.length}).`);
});
