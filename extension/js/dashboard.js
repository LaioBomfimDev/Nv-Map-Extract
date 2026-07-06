// ================================================================
// MAPS SEARCH EXTRACTOR — Dashboard JS (página de resultados)
// ================================================================

const DEFAULT_URL = 'http://localhost:5000/api';
let allLeads = [];
let filtered = [];

// ——— Carregar leads do storage ———————————————————————————————————
chrome.storage.local.get({ leads: [] }, ({ leads }) => {
    allLeads = leads;
    renderStats(leads);
    renderTable(leads);
    filtered = leads;
});

// ——— Filtros ————————————————————————————————————————————————————
['filterName', 'filterCategory', 'filterCity'].forEach(id => {
    document.getElementById(id).addEventListener('input', applyFilters);
});

function applyFilters() {
    const name     = document.getElementById('filterName').value.toLowerCase();
    const category = document.getElementById('filterCategory').value.toLowerCase();
    const city     = document.getElementById('filterCity').value.toLowerCase();

    filtered = allLeads.filter(l => {
        const n  = String(l.name || '').toLowerCase();
        const c  = String(l.category || '').toLowerCase();
        const a  = String(l.address || '').toLowerCase();
        return (!name || n.includes(name))
            && (!category || c.includes(category))
            && (!city || a.includes(city));
    });

    renderTable(filtered);
    renderStats(filtered);
}

// ——— Renderizar stats —————————————————————————————————————————
function renderStats(leads) {
    document.getElementById('statTotal').textContent   = leads.length;
    document.getElementById('statEmail').textContent   = leads.filter(l => l.email).length;
    document.getElementById('statWebsite').textContent = leads.filter(l => l.website).length;
    document.getElementById('statPhone').textContent   = leads.filter(l => l.phone).length;
    document.getElementById('totalBadge').textContent  = `${leads.length} leads`;
}

// ——— Renderizar tabela ————————————————————————————————————————
function renderTable(leads) {
    const tbody = document.getElementById('tbody');
    tbody.innerHTML = '';

    if (!leads.length) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:60px 0;color:#475569;">
            <div style="font-size:3rem;margin-bottom:12px;">📭</div>
            <div>Nenhum lead encontrado</div>
        </td></tr>`;
        return;
    }

    leads.forEach(l => {
        const tr = document.createElement('tr');

        const ratingStars = l.averageRating
            ? `<span class="rating">★ ${Number(l.averageRating).toFixed(1)}</span>`
            : '—';

        const emailBadge = l.email
            ? `<span class="badge-email" title="${l.email}">✓ email</span>`
            : '—';

        tr.innerHTML = `
            <td title="${l.name || ''}">${l.name || '—'}</td>
            <td title="${l.category || ''}">${l.category || '—'}</td>
            <td>${l.phone || '—'}</td>
            <td title="${l.address || ''}">${l.address || '—'}</td>
            <td>${l.website ? `<a href="${l.website}" target="_blank">🔗 Site</a>` : '—'}</td>
            <td>${emailBadge}</td>
            <td>${ratingStars}</td>
            <td>${l.reviewCount || l.reviews_count || '—'}</td>
            <td>${l.instagram ? `<a href="${l.instagram}" target="_blank">@ig</a>` : '—'}</td>
            <td>${l.linkedin  ? `<a href="${l.linkedin}"  target="_blank">in</a>`  : '—'}</td>
        `;
        tbody.appendChild(tr);
    });
}

// ——— Enviar ao Dashboard —————————————————————————————————————
document.getElementById('btnSend').addEventListener('click', async () => {
    const data = filtered.length ? filtered : allLeads;
    if (!data.length) return setStatus('⚠️ Nenhum lead para enviar.');

    setStatus(`📤 Enviando ${data.length} leads para a nuvem...`);
    document.getElementById('btnSend').disabled = true;

    // Envia via service worker (bg.js) → Supabase, em nome do usuário logado.
    chrome.runtime.sendMessage(
        { action: 'sendToDashboard', data: { leads: data, keyword: 'maps', city: '' } },
        (response) => {
            document.getElementById('btnSend').disabled = false;
            if (response?.success) {
                setStatus(`✅ ${response.message || `${data.length} leads enviados!`}`);
            } else {
                setStatus(`❌ Falha: ${response?.message || 'Erro ao enviar'}`);
            }
        }
    );
});

// ——— Exportar CSV ————————————————————————————————————————————
document.getElementById('btnCsv').addEventListener('click', () => {
    const data = filtered.length ? filtered : allLeads;
    if (!data.length) return setStatus('⚠️ Nenhum lead para exportar.');

    const keys    = Object.keys(data[0]);
    const header  = keys.join(',');
    const rows    = data.map(r => keys.map(k => `"${String(r[k] || '').replace(/"/g, '""')}"`).join(','));
    const csv     = [header, ...rows].join('\n');
    const blob    = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url     = URL.createObjectURL(blob);
    const a       = document.createElement('a');
    a.href        = url;
    a.download    = `leads_maps_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus(`✅ CSV com ${data.length} leads baixado.`);
});

// ——— Limpar ——————————————————————————————————————————————————
document.getElementById('btnClear').addEventListener('click', () => {
    chrome.storage.local.set({ leads: [] }, () => {
        allLeads = [];
        filtered = [];
        renderStats([]);
        renderTable([]);
        setStatus('🗑️ Leads limpos.');
    });
});

// ——— Helpers —————————————————————————————————————————————————
function setStatus(msg) {
    document.getElementById('statusMsg').textContent = msg;
}

function getConfig() {
    return new Promise(resolve => {
        chrome.storage.sync.get({ dashboardUrl: DEFAULT_URL }, resolve);
    });
}
