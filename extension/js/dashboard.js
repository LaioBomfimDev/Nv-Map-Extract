// ================================================================
// MAPS SEARCH EXTRACTOR — Dashboard JS (página de resultados)
// ================================================================

let allLeads = [];
let filtered = [];

function firstCsvValue(value) {
    return String(value ?? '').split(',')[0].trim();
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    }[char]));
}

function safeExternalUrl(value) {
    let raw = firstCsvValue(value);
    if (!raw) return '';
    if (raw.startsWith('//')) raw = `https:${raw}`;
    const candidate = /^[a-z][a-z\d+.-]*:/i.test(raw) ? raw : `https://${raw}`;
    try {
        const url = new URL(candidate);
        return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch (_) {
        return '';
    }
}

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

        const rating = Number(l.averageRating);
        const ratingStars = Number.isFinite(rating) && rating > 0
            ? `<span class="rating">★ ${rating.toFixed(1)}</span>`
            : '—';

        const email = firstCsvValue(l.email);
        const websiteUrl = safeExternalUrl(l.website);
        const instagramUrl = safeExternalUrl(l.instagram);
        const linkedinUrl = safeExternalUrl(l.linkedin);

        const emailBadge = email
            ? `<span class="badge-email" title="${escapeHtml(email)}">✓ email</span>`
            : '—';

        tr.innerHTML = `
            <td title="${escapeHtml(l.name || '')}">${escapeHtml(l.name || '—')}</td>
            <td title="${escapeHtml(l.category || '')}">${escapeHtml(l.category || '—')}</td>
            <td>${escapeHtml(l.phone || '—')}</td>
            <td title="${escapeHtml(l.address || '')}">${escapeHtml(l.address || '—')}</td>
            <td>${websiteUrl ? `<a href="${escapeHtml(websiteUrl)}" target="_blank" rel="noreferrer">🔗 Site</a>` : '—'}</td>
            <td>${emailBadge}</td>
            <td>${ratingStars}</td>
            <td>${escapeHtml(l.reviewCount || l.reviews_count || '—')}</td>
            <td>${instagramUrl ? `<a href="${escapeHtml(instagramUrl)}" target="_blank" rel="noreferrer">@ig</a>` : '—'}</td>
            <td>${linkedinUrl ? `<a href="${escapeHtml(linkedinUrl)}" target="_blank" rel="noreferrer">in</a>` : '—'}</td>
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
