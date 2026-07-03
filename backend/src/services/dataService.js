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
            `ALTER TABLE searches ADD COLUMN source TEXT DEFAULT 'csv'`,
        ];
        newCols.forEach(sql => db.run(sql, err => {})); // ignora erros de coluna já existente

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

function getResults(searchId, { page = 1, limit = 50, filters = {} } = {}) {
    return new Promise((resolve, reject) => {
        if (!db) return resolve({ data: [], total: 0, page, limit });

        const offset = (page - 1) * limit;
        let where = 'WHERE search_id = ?';
        const params = [searchId];

        // 1. Filtros textuais básicos
        if (filters.name) { where += ' AND name LIKE ?'; params.push(`%${filters.name}%`); }
        if (filters.category) { where += ' AND category LIKE ?'; params.push(`%${filters.category}%`); }
        if (filters.city) { where += ' AND address LIKE ?'; params.push(`%${filters.city}%`); }
        
        // 2. Filtro de Status CRM
        if (filters.prospect_status) { where += ' AND prospect_status = ?'; params.push(filters.prospect_status); }

        // 3. Filtros booleanos de dados de prospecção
        if (filters.has_website === '1') { where += " AND website IS NOT NULL AND website != '' AND website != '—'"; }
        else if (filters.has_website === '0') { where += " AND (website IS NULL OR website = '' OR website = '—')"; }

        if (filters.has_email === '1') { where += " AND email IS NOT NULL AND email != '' AND email != '—'"; }
        else if (filters.has_email === '0') { where += " AND (email IS NULL OR email = '' OR email = '—')"; }

        if (filters.has_phone === '1') { where += " AND phone IS NOT NULL AND phone != '' AND phone != '—'"; }
        else if (filters.has_phone === '0') { where += " AND (phone IS NULL OR phone = '' OR phone = '—')"; }

        // 4. Sem Redes Sociais
        if (filters.no_social === '1') {
            where += " AND (instagram IS NULL OR instagram = '') AND (facebook IS NULL OR facebook = '') AND (linkedin IS NULL OR linkedin = '') AND (twitter IS NULL OR twitter = '') AND (youtube IS NULL OR youtube = '')";
        }

        // 5. Filtros de classificação por notas
        if (filters.min_rating) { where += ' AND rating >= ?'; params.push(parseFloat(filters.min_rating)); }
        if (filters.max_rating) { where += ' AND rating <= ?'; params.push(parseFloat(filters.max_rating)); }

        // 6. Filtros de volume de avaliações
        if (filters.min_reviews) { where += ' AND reviews_count >= ?'; params.push(parseInt(filters.min_reviews)); }
        if (filters.max_reviews) { where += ' AND reviews_count <= ?'; params.push(parseInt(filters.max_reviews)); }

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

function updateProspectStatus(resultId, status) {
    return new Promise((resolve, reject) => {
        if (!db) return resolve(false);
        db.run(
            `UPDATE results SET prospect_status = ? WHERE id = ?`,
            [status, resultId],
            function (err) {
                if (err) return reject(err);
                resolve(this.changes > 0);
            }
        );
    });
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
    getDashboardMetrics,
    getRecentSearches,
    updateProspectStatus,
};
