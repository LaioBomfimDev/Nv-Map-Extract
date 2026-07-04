const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

let db = null;

function getDbPath() {
    if (process.env.VERCEL) return '/tmp/searches.db';
    const dbDir = path.join(__dirname, '../../../database');
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
    return path.join(dbDir, 'searches.db');
}

function initDatabase() {
    try {
        const sqlite3 = require('sqlite3').verbose();
        db = new sqlite3.Database(getDbPath(), (err) => {
            if (err) {
                logger.error('Erro ao abrir banco de dados', { error: err.message });
                return;
            }
            logger.info('Banco de dados SQLite conectado');
            createTables();
        });
    } catch (e) {
        logger.error('sqlite3 não instalado, usando modo memória', { error: e.message });
    }
}

function createTables() {
    if (!db) return;
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS searches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL,
            keyword TEXT,
            city TEXT,
            total_results INTEGER DEFAULT 0,
            status TEXT DEFAULT 'completed',
            source TEXT DEFAULT 'csv',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            search_id INTEGER,
            name TEXT,
            address TEXT,
            phone TEXT,
            website TEXT,
            rating REAL,
            reviews_count INTEGER,
            category TEXT,
            email TEXT,
            latitude REAL,
            longitude REAL,
            place_id TEXT,
            cid TEXT,
            instagram TEXT,
            facebook TEXT,
            linkedin TEXT,
            twitter TEXT,
            youtube TEXT,
            prospect_status TEXT DEFAULT 'novo',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (search_id) REFERENCES searches(id)
        )`);

        // Migração: adicionar colunas novas em tabelas existentes (sem falhar)
        const newCols = [
            `ALTER TABLE results ADD COLUMN place_id TEXT`,
            `ALTER TABLE results ADD COLUMN cid TEXT`,
            `ALTER TABLE results ADD COLUMN instagram TEXT`,
            `ALTER TABLE results ADD COLUMN facebook TEXT`,
            `ALTER TABLE results ADD COLUMN linkedin TEXT`,
            `ALTER TABLE results ADD COLUMN twitter TEXT`,
            `ALTER TABLE results ADD COLUMN youtube TEXT`,
            `ALTER TABLE results ADD COLUMN prospect_status TEXT DEFAULT 'novo'`,
            `ALTER TABLE results ADD COLUMN notes TEXT`,
            `ALTER TABLE results ADD COLUMN last_contact_at DATETIME`,
            `ALTER TABLE searches ADD COLUMN source TEXT DEFAULT 'csv'`,
        ];
        newCols.forEach(sql => db.run(sql, err => {})); // ignora erros de coluna já existente

        // Migração de status legados para o funil de prospecção atual
        const statusMigrations = [
            `UPDATE results SET prospect_status = 'enviado' WHERE prospect_status = 'contatado'`,
            `UPDATE results SET prospect_status = 'respondeu' WHERE prospect_status IN ('interessado', 'reuniao')`,
            `UPDATE results SET prospect_status = 'descartado' WHERE prospect_status = 'recusado'`,
        ];
        statusMigrations.forEach(sql => db.run(sql, err => {}));

        // Empresas apagadas pelo usuário: nunca mais reimportar nem sugerir
        db.run(`CREATE TABLE IF NOT EXISTS ignored_leads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            place_id TEXT,
            phone TEXT,
            name TEXT,
            address TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Arquivos já importados pelo FileWatcher (evita reimportação a cada reinício)
        db.run(`CREATE TABLE IF NOT EXISTS processed_files (
            filename TEXT PRIMARY KEY,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        logger.info('Tabelas criadas/verificadas com sucesso');
    });
}

function checkDatabaseConnection() {
    return new Promise((resolve) => {
        if (!db) return resolve(false);
        db.get('SELECT 1', (err) => resolve(!err));
    });
}

function saveSearch(filename, data, source = 'csv') {
    return new Promise((resolve, reject) => {
        if (!db) return resolve({ id: Date.now(), filename });

        const keyword = extractKeyword(filename);
        const city = extractCity(filename);

        db.run(
            `INSERT INTO searches (filename, keyword, city, total_results, source) VALUES (?, ?, ?, ?, ?)`,
            [filename, keyword, city, data.length, source],
            function (err) {
                if (err) return reject(err);
                const searchId = this.lastID;
                saveResults(searchId, data)
                    .then(() => resolve({ id: searchId, filename, keyword, city, total_results: data.length, source }))
                    .catch(reject);
            }
        );
    });
}

// Verifica se a empresa foi apagada pelo usuário (não deve voltar ao sistema)
function isLeadIgnored(placeId, phone, name, address) {
    return new Promise((resolve) => {
        if (!db) return resolve(false);
        db.get(
            `SELECT 1 FROM ignored_leads WHERE
                (place_id != '' AND place_id = ?) OR
                (phone != '' AND phone = ?) OR
                (name != '' AND name = ? AND address = ?)
             LIMIT 1`,
            [placeId || '', phone || '', name || '', address || ''],
            (err, row) => resolve(Boolean(row))
        );
    });
}

async function saveResults(searchId, rows) {
    if (!db || !rows.length) return;

    for (const row of rows) {
        const name = row.name || row.Nome || row.title || '';
        const phone = row.phone || row.Telefone || row.telefone || '';
        const address = Array.isArray(row.address) ? row.address.join(', ') : (row.address || row.Endereço || row.endereco || '');
        const email = Array.isArray(row.email) ? row.email.join(', ') : (row.email || row.Email || '');
        const website = row.website || row.Website || row.site || '';
        const rating = parseFloat(row.rating || row.averageRating || row.Rating || row.avaliacao || 0) || 0;
        const reviewsCount = parseInt(row.reviews_count || row.reviewCount || row.Avaliações || row.reviews || 0) || 0;
        const category = Array.isArray(row.category) ? row.category.join(', ') : (row.category || row.Categoria || row.categoria || '');
        const lat = parseFloat(row.latitude || row.lat || 0) || 0;
        const lng = parseFloat(row.longitude || row.lng || row.lon || 0) || 0;
        const placeId = row.placeID || row.place_id || '';
        const cid = row.cID || row.cid || '';
        const instagram = row.instagram || '';
        const facebook = row.facebook || '';
        const linkedin = row.linkedin || '';
        const twitter = row.twitter || '';
        const youtube = row.youtube || '';

        // Empresa apagada pelo usuário: não reimportar
        if (await isLeadIgnored(placeId, phone, name, address)) {
            logger.info('Lead ignorado (apagado anteriormente pelo usuário)', { name });
            continue;
        }

        await new Promise((resolveRow) => {
            // Verificar duplicidade: por telefone (se houver) OU por nome + endereço exato
            let checkSql = 'SELECT * FROM results WHERE ';
            let params = [];
            if (phone && phone.trim().length > 3) {
                checkSql += 'phone = ?';
                params.push(phone);
            } else {
                checkSql += 'name = ? AND address = ?';
                params.push(name, address);
            }

            db.get(checkSql, params, (err, existing) => {
                if (err) {
                    logger.error('Erro ao verificar duplicidade', err);
                    return resolveRow();
                }

                if (existing) {
                    // Mesclar dados: preencher campos novos que estejam vazios no banco
                    const mergedEmail = existing.email || email;
                    const mergedWebsite = existing.website || website;
                    const mergedCategory = existing.category || category;
                    const mergedPhone = existing.phone || phone;
                    const mergedPlaceId = existing.place_id || placeId;
                    const mergedCid = existing.cid || cid;
                    const mergedInstagram = existing.instagram || instagram;
                    const mergedFacebook = existing.facebook || facebook;
                    const mergedLinkedin = existing.linkedin || linkedin;
                    const mergedTwitter = existing.twitter || twitter;
                    const mergedYoutube = existing.youtube || youtube;
                    const mergedRating = rating > 0 ? rating : existing.rating;
                    const mergedReviews = reviewsCount > 0 ? reviewsCount : existing.reviews_count;
                    const mergedLat = lat !== 0 ? lat : existing.latitude;
                    const mergedLng = lng !== 0 ? lng : existing.longitude;

                    // Mover o lead existente para o search_id mais recente, mesclando suas informações
                    db.run(`UPDATE results SET 
                        search_id = ?,
                        name = ?,
                        address = ?,
                        phone = ?,
                        website = ?,
                        rating = ?,
                        reviews_count = ?,
                        category = ?,
                        email = ?,
                        latitude = ?,
                        longitude = ?,
                        place_id = ?,
                        cid = ?,
                        instagram = ?,
                        facebook = ?,
                        linkedin = ?,
                        twitter = ?,
                        youtube = ?
                        WHERE id = ?`,
                        [
                            searchId, name, address, mergedPhone, mergedWebsite, mergedRating, mergedReviews,
                            mergedCategory, mergedEmail, mergedLat, mergedLng, mergedPlaceId, mergedCid,
                            mergedInstagram, mergedFacebook, mergedLinkedin, mergedTwitter, mergedYoutube,
                            existing.id
                        ],
                        (errUpdate) => {
                            if (errUpdate) logger.error('Erro ao mesclar lead duplicado', errUpdate);
                            resolveRow();
                        }
                    );
                } else {
                    // Inserir novo registro de lead inédito
                    db.run(`INSERT INTO results 
                        (search_id, name, address, phone, website, rating, reviews_count, category, email, latitude, longitude,
                         place_id, cid, instagram, facebook, linkedin, twitter, youtube)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            searchId, name, address, phone, website, rating, reviewsCount, category, email, lat, lng,
                            placeId, cid, instagram, facebook, linkedin, twitter, youtube
                        ],
                        (errInsert) => {
                            if (errInsert) logger.error('Erro ao inserir lead novo', errInsert);
                            resolveRow();
                        }
                    );
                }
            });
        });
    }
}

function getSearches() {
    return new Promise((resolve, reject) => {
        if (!db) return resolve([]);
        db.all(`SELECT * FROM searches ORDER BY created_at DESC`, (err, rows) => {
            if (err) return reject(err);
            resolve(rows || []);
        });
    });
}

// Cria o registro da busca imediatamente (usado pelo scraper para salvar leads em tempo real)
function createSearch(filename, keyword, city, source = 'scraper') {
    return new Promise((resolve, reject) => {
        if (!db) return resolve({ id: Date.now(), filename });
        db.run(
            `INSERT INTO searches (filename, keyword, city, total_results, status, source) VALUES (?, ?, ?, 0, 'running', ?)`,
            [filename, keyword, city, source],
            function (err) {
                if (err) return reject(err);
                resolve({ id: this.lastID, filename, keyword, city });
            }
        );
    });
}

function updateSearchTotals(searchId, total, status = 'completed') {
    return new Promise((resolve, reject) => {
        if (!db) return resolve(false);
        db.run(
            `UPDATE searches SET total_results = ?, status = ? WHERE id = ?`,
            [total, status, searchId],
            function (err) {
                if (err) return reject(err);
                resolve(this.changes > 0);
            }
        );
    });
}

// Monta as cláusulas de filtro compartilhadas entre getResults e getAllLeads.
// `alias` prefixa as colunas quando a query usa JOIN (ex: 'r').
function buildResultFilters(filters = {}, alias = '') {
    const p = alias ? `${alias}.` : '';
    let where = '';
    const params = [];

    // 1. Filtros textuais básicos
    if (filters.name) { where += ` AND ${p}name LIKE ?`; params.push(`%${filters.name}%`); }
    if (filters.category) { where += ` AND ${p}category LIKE ?`; params.push(`%${filters.category}%`); }
    if (filters.city) { where += ` AND ${p}address LIKE ?`; params.push(`%${filters.city}%`); }

    // 2. Filtro de Status CRM
    if (filters.prospect_status) { where += ` AND ${p}prospect_status = ?`; params.push(filters.prospect_status); }

    // 3. Filtros booleanos de dados de prospecção
    if (filters.has_website === '1') { where += ` AND ${p}website IS NOT NULL AND ${p}website != '' AND ${p}website != '—'`; }
    else if (filters.has_website === '0') { where += ` AND (${p}website IS NULL OR ${p}website = '' OR ${p}website = '—')`; }

    if (filters.has_email === '1') { where += ` AND ${p}email IS NOT NULL AND ${p}email != '' AND ${p}email != '—'`; }
    else if (filters.has_email === '0') { where += ` AND (${p}email IS NULL OR ${p}email = '' OR ${p}email = '—')`; }

    if (filters.has_phone === '1') { where += ` AND ${p}phone IS NOT NULL AND ${p}phone != '' AND ${p}phone != '—'`; }
    else if (filters.has_phone === '0') { where += ` AND (${p}phone IS NULL OR ${p}phone = '' OR ${p}phone = '—')`; }

    // 4. Sem Redes Sociais
    if (filters.no_social === '1') {
        where += ` AND (${p}instagram IS NULL OR ${p}instagram = '') AND (${p}facebook IS NULL OR ${p}facebook = '') AND (${p}linkedin IS NULL OR ${p}linkedin = '') AND (${p}twitter IS NULL OR ${p}twitter = '') AND (${p}youtube IS NULL OR ${p}youtube = '')`;
    }

    // 5. Filtros de classificação por notas
    if (filters.min_rating) { where += ` AND ${p}rating >= ?`; params.push(parseFloat(filters.min_rating)); }
    if (filters.max_rating) { where += ` AND ${p}rating <= ?`; params.push(parseFloat(filters.max_rating)); }

    // 6. Filtros de volume de avaliações
    if (filters.min_reviews) { where += ` AND ${p}reviews_count >= ?`; params.push(parseInt(filters.min_reviews)); }
    if (filters.max_reviews) { where += ` AND ${p}reviews_count <= ?`; params.push(parseInt(filters.max_reviews)); }

    return { where, params };
}

function getResults(searchId, { page = 1, limit = 50, filters = {} } = {}) {
    return new Promise((resolve, reject) => {
        if (!db) return resolve({ data: [], total: 0, page, limit });

        const offset = (page - 1) * limit;
        const built = buildResultFilters(filters);
        const where = 'WHERE search_id = ?' + built.where;
        const params = [searchId, ...built.params];

        db.get(`SELECT COUNT(*) as total FROM results ${where}`, params, (err, countRow) => {
            if (err) return reject(err);
            db.all(
                `SELECT * FROM results ${where} LIMIT ? OFFSET ?`,
                [...params, limit, offset],
                (err2, rows) => {
                    if (err2) return reject(err2);
                    resolve({ data: rows || [], total: countRow?.total || 0, page, limit });
                }
            );
        });
    });
}

// Base unificada: todos os leads de todas as buscas, com origem
function getAllLeads({ page = 1, limit = 50, filters = {} } = {}) {
    return new Promise((resolve, reject) => {
        if (!db) return resolve({ data: [], total: 0, page, limit });

        const offset = (page - 1) * limit;
        const built = buildResultFilters(filters, 'r');
        const where = 'WHERE 1=1' + built.where;

        db.get(`SELECT COUNT(*) as total FROM results r ${where}`, built.params, (err, countRow) => {
            if (err) return reject(err);
            db.all(
                `SELECT r.*, s.filename AS search_filename, s.keyword AS search_keyword, s.city AS search_city
                 FROM results r LEFT JOIN searches s ON s.id = r.search_id
                 ${where} ORDER BY r.id DESC LIMIT ? OFFSET ?`,
                [...built.params, limit, offset],
                (err2, rows) => {
                    if (err2) return reject(err2);
                    resolve({ data: rows || [], total: countRow?.total || 0, page, limit });
                }
            );
        });
    });
}

function deleteSearch(searchId) {
    return new Promise((resolve, reject) => {
        if (!db) return resolve(false);
        db.run(`DELETE FROM results WHERE search_id = ?`, [searchId], (err) => {
            if (err) return reject(err);
            db.run(`DELETE FROM searches WHERE id = ?`, [searchId], function (err2) {
                if (err2) return reject(err2);
                resolve(this.changes > 0);
            });
        });
    });
}

function renameSearch(searchId, filename) {
    return new Promise((resolve, reject) => {
        if (!db) return resolve(false);
        db.run(`UPDATE searches SET filename = ? WHERE id = ?`, [filename, searchId], function (err) {
            if (err) return reject(err);
            resolve(this.changes > 0);
        });
    });
}

// Recalcula total_results das buscas afetadas (após exclusão de leads)
function recomputeSearchTotals(searchIds) {
    return Promise.all(searchIds.map(id => new Promise((resolve) => {
        db.run(
            `UPDATE searches SET total_results = (SELECT COUNT(*) FROM results WHERE search_id = ?) WHERE id = ?`,
            [id, id],
            () => resolve()
        );
    })));
}

function deleteResults(ids) {
    return new Promise((resolve, reject) => {
        if (!db || !ids.length) return resolve(0);
        const placeholders = ids.map(() => '?').join(',');
        db.all(`SELECT id, search_id, place_id, phone, name, address FROM results WHERE id IN (${placeholders})`, ids, (err, rows) => {
            if (err) return reject(err);
            const searchIds = [...new Set((rows || []).map(r => r.search_id).filter(Boolean))];

            // Registrar na lista de ignorados: essas empresas não voltam em buscas futuras
            (rows || []).forEach(r => {
                db.run(
                    `INSERT INTO ignored_leads (place_id, phone, name, address) VALUES (?, ?, ?, ?)`,
                    [r.place_id || '', r.phone || '', r.name || '', r.address || ''],
                    () => {}
                );
            });

            db.run(`DELETE FROM results WHERE id IN (${placeholders})`, ids, function (err2) {
                if (err2) return reject(err2);
                const deleted = this.changes;
                recomputeSearchTotals(searchIds).then(() => resolve(deleted));
            });
        });
    });
}

function getIgnoredLeads() {
    return new Promise((resolve, reject) => {
        if (!db) return resolve([]);
        db.all(`SELECT * FROM ignored_leads ORDER BY created_at DESC`, (err, rows) => {
            if (err) return reject(err);
            resolve(rows || []);
        });
    });
}

// Remove da lista de ignorados: a empresa volta a poder aparecer em buscas futuras
function restoreIgnoredLead(id) {
    return new Promise((resolve, reject) => {
        if (!db) return resolve(false);
        db.run(`DELETE FROM ignored_leads WHERE id = ?`, [id], function (err) {
            if (err) return reject(err);
            resolve(this.changes > 0);
        });
    });
}

function isFileProcessed(filename) {
    return new Promise((resolve) => {
        if (!db) return resolve(false);
        db.get(`SELECT 1 FROM processed_files WHERE filename = ?`, [filename], (err, row) => resolve(Boolean(row)));
    });
}

function markFileProcessed(filename) {
    return new Promise((resolve) => {
        if (!db) return resolve();
        db.run(`INSERT OR IGNORE INTO processed_files (filename) VALUES (?)`, [filename], () => resolve());
    });
}

// Atualiza status e/ou anotações de um lead; marca data de contato ao enviar
function updateLead(resultId, { status, notes } = {}) {
    return new Promise((resolve, reject) => {
        if (!db) return resolve(false);
        const sets = [];
        const params = [];
        if (status !== undefined) {
            sets.push('prospect_status = ?');
            params.push(status);
            if (status === 'enviado') sets.push('last_contact_at = CURRENT_TIMESTAMP');
        }
        if (notes !== undefined) {
            sets.push('notes = ?');
            params.push(notes);
        }
        if (!sets.length) return resolve(false);
        params.push(resultId);
        db.run(`UPDATE results SET ${sets.join(', ')} WHERE id = ?`, params, function (err) {
            if (err) return reject(err);
            resolve(this.changes > 0);
        });
    });
}

function bulkUpdateStatus(ids, status) {
    return new Promise((resolve, reject) => {
        if (!db || !ids.length) return resolve(0);
        const placeholders = ids.map(() => '?').join(',');
        const extra = status === 'enviado' ? ', last_contact_at = CURRENT_TIMESTAMP' : '';
        db.run(
            `UPDATE results SET prospect_status = ?${extra} WHERE id IN (${placeholders})`,
            [status, ...ids],
            function (err) {
                if (err) return reject(err);
                resolve(this.changes);
            }
        );
    });
}

// Resumo da prospecção: contagens do funil, follow-ups atrasados e sugestões de alvos
function getProspectSummary() {
    return new Promise((resolve, reject) => {
        if (!db) return resolve({ statusCounts: {}, followUps: { count: 0, sample: [] }, suggestions: [] });

        db.all(`SELECT prospect_status AS status, COUNT(*) AS count FROM results GROUP BY prospect_status`, (err, rows) => {
            if (err) return reject(err);
            const statusCounts = {};
            (rows || []).forEach(r => { statusCounts[r.status || 'novo'] = r.count; });

            const followUpWhere = `prospect_status = 'enviado' AND last_contact_at IS NOT NULL AND last_contact_at <= datetime('now', '-3 day')`;
            db.get(`SELECT COUNT(*) AS count FROM results WHERE ${followUpWhere}`, (err2, fuCount) => {
                if (err2) return reject(err2);
                db.all(`SELECT * FROM results WHERE ${followUpWhere} ORDER BY last_contact_at ASC LIMIT 5`, (err3, fuSample) => {
                    if (err3) return reject(err3);

                    const semSiteWhere = `prospect_status = 'novo' AND phone IS NOT NULL AND phone != '' AND (website IS NULL OR website = '')`;
                    db.get(`SELECT COUNT(*) AS count FROM results WHERE ${semSiteWhere}`, (err4, ssCount) => {
                        if (err4) return reject(err4);
                        db.all(`SELECT * FROM results WHERE ${semSiteWhere} ORDER BY reviews_count DESC LIMIT 5`, (err5, ssSample) => {
                            if (err5) return reject(err5);

                            const semSocialWhere = `prospect_status = 'novo' AND phone IS NOT NULL AND phone != ''
                                AND (instagram IS NULL OR instagram = '') AND (facebook IS NULL OR facebook = '')
                                AND (linkedin IS NULL OR linkedin = '') AND (twitter IS NULL OR twitter = '') AND (youtube IS NULL OR youtube = '')`;
                            db.get(`SELECT COUNT(*) AS count FROM results WHERE ${semSocialWhere}`, (err6, snCount) => {
                                if (err6) return reject(err6);
                                db.all(`SELECT * FROM results WHERE ${semSocialWhere} ORDER BY reviews_count DESC LIMIT 5`, (err7, snSample) => {
                                    if (err7) return reject(err7);
                                    resolve({
                                        statusCounts,
                                        followUps: { count: fuCount?.count || 0, sample: fuSample || [] },
                                        suggestions: [
                                            {
                                                type: 'sem_site',
                                                title: 'Têm telefone mas não têm site',
                                                hint: 'Ótimos alvos para oferecer criação de site',
                                                filters: { prospect_status: 'novo', has_phone: '1', has_website: '0' },
                                                count: ssCount?.count || 0,
                                                sample: ssSample || [],
                                            },
                                            {
                                                type: 'sem_social',
                                                title: 'Têm telefone mas não têm redes sociais',
                                                hint: 'Oportunidade para gestão de redes/marketing',
                                                filters: { prospect_status: 'novo', has_phone: '1', no_social: '1' },
                                                count: snCount?.count || 0,
                                                sample: snSample || [],
                                            },
                                        ],
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    });
}

function updateProspectStatus(resultId, status) {
    return updateLead(resultId, { status });
}

function getDashboardMetrics() {
    return new Promise((resolve, reject) => {
        if (!db) return resolve({ totalSearches: 0, totalResults: 0, avgRating: 0, topCategories: [] });

        db.get(`SELECT 
            COUNT(*) as totalSearches,
            SUM(total_results) as totalResults
            FROM searches`, (err, row) => {
            if (err) return reject(err);

            db.get(`SELECT AVG(rating) as avgRating FROM results WHERE rating > 0`, (err2, ratingRow) => {
                if (err2) return reject(err2);

                db.all(`SELECT category, COUNT(*) as count FROM results 
                    WHERE category != '' GROUP BY category ORDER BY count DESC LIMIT 10`,
                    (err3, cats) => {
                        if (err3) return reject(err3);
                        resolve({
                            totalSearches: row?.totalSearches || 0,
                            totalResults: row?.totalResults || 0,
                            avgRating: parseFloat((ratingRow?.avgRating || 0).toFixed(1)),
                            topCategories: cats || [],
                        });
                    });
            });
        });
    });
}

function getRecentSearches(limit = 5) {
    return new Promise((resolve, reject) => {
        if (!db) return resolve([]);
        db.all(`SELECT * FROM searches ORDER BY created_at DESC LIMIT ?`, [limit], (err, rows) => {
            if (err) return reject(err);
            resolve(rows || []);
        });
    });
}

function extractKeyword(filename) {
    const base = path.basename(filename, path.extname(filename));
    return base.replace(/[_-]/g, ' ').replace(/\d{4,}/g, '').trim();
}

function extractCity(filename) {
    const cities = ['saopaulo', 'riodejaneiro', 'belo horizonte', 'salvador', 'brasilia', 'curitiba', 'manaus', 'fortaleza'];
    const lower = filename.toLowerCase().replace(/[_-]/g, '');
    const found = cities.find(c => lower.includes(c.replace(/ /g, '')));
    return found || '';
}

module.exports = {
    initDatabase,
    checkDatabaseConnection,
    saveSearch,
    saveResults,
    createSearch,
    updateSearchTotals,
    getSearches,
    getResults,
    getAllLeads,
    getDashboardMetrics,
    getRecentSearches,
    updateProspectStatus,
    updateLead,
    bulkUpdateStatus,
    deleteSearch,
    renameSearch,
    deleteResults,
    getProspectSummary,
    getIgnoredLeads,
    restoreIgnoredLead,
    isFileProcessed,
    markFileProcessed,
};
