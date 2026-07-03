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
    });

    // ENVIAR AO DASHBOARD
    btnSend.addEventListener('click', async () => {
        if (leads.length === 0) {
            setStatus('⚠️ Nenhum lead para enviar.', 'warning');
            return;
        }

        setStatus(`📤 Enviando ${leads.length} leads para o Dashboard...`, 'info');
        btnSend.disabled = true;

        const searchInput = document.querySelector('input[aria-label]');
        const keyword = searchInput?.value || document.title || 'maps_search';
        const urlMatch = window.location.href.match(/search\/([^/]+)/);
        const searchTerm = urlMatch ? decodeURIComponent(urlMatch[1]) : keyword;

        chrome.runtime.sendMessage({
            action: 'sendToDashboard',
            data: { leads, keyword: searchTerm, city: '' },
        }, (response) => {
            btnSend.disabled = false;
            if (response?.success) {
                setStatus(`✅ ${leads.length} leads enviados com sucesso!`, 'success');
            } else {
                setStatus(`❌ Falha: ${response?.message || 'Erro de conexão'}`, 'error');
            }
        });
    });

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

// ——— Listener de mensagens do Google Maps (XHR interceptado) ————
window.addEventListener('message', async function (event) {
    if (!event.data || event.data.type !== 'search' || !event.data.data) return;

    try {
        const raw = JSON.parse(event.data.data.replace('/*""*/', ''));
        const results = JSON.parse(raw.d.slice(5));
        
        // Localização inteligente e dinâmica do feed (Evita falhas se Google mudar índices do JSON)
        const feed = findFeedArray(results);
        if (!feed) {
            console.warn('[MSE] Array de estabelecimentos não encontrado no payload de resposta.');
            return;
        }

        const newLeads = [];
        for (let k = 0; k < feed.length; k++) {
            try {
                const e = feed[k][feed[k].length - 1];
                if (!e || !Array.isArray(e)) continue;

                const placeID = e[78] || '';
                if (!placeID || leads_lnglat.has(placeID)) continue;

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

                leads_lnglat.add(placeID);
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

        if (newLeads.length === 0) return;

        // Inserir leads imediatamente para feedback visual instantâneo na interface
        newLeads.forEach(l => leads.push(l));
        if (window._mse_updateCount) window._mse_updateCount(leads.length);

        // Enriquecer com e-mails em segundo plano sem bloquear a interface de extração
        newLeads.forEach(async (lead) => {
            try {
                if (lead.website && collect_email) {
                    const d = await chrome.runtime.sendMessage({
                        action: 'email',
                        data: { website: lead.website, name: lead.name, deep_search: true },
                    });
                    if (d) {
                        const idx = leads.findIndex(l => l.placeID === lead.placeID);
                        if (idx !== -1) {
                            for (const k in d) {
                                leads[idx][k] = Array.isArray(d[k]) ? d[k].join(', ') : d[k];
                            }
                        }
                    }
                }
            } catch (_) {}
        });

    } catch (err) {
        console.warn('[MSE] Erro ao processar mensagem XHR interceptada:', err);
    }
});
