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
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (search_id) REFERENCES searches(id)
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

function saveSearch(filename, data) {
    return new Promise((resolve, reject) => {
        if (!db) return resolve({ id: Date.now(), filename });

        const keyword = extractKeyword(filename);
        const city = extractCity(filename);

        db.run(
            `INSERT INTO searches (filename, keyword, city, total_results) VALUES (?, ?, ?, ?)`,
            [filename, keyword, city, data.length],
            function (err) {
                if (err) return reject(err);
                const searchId = this.lastID;
                saveResults(searchId, data)
                    .then(() => resolve({ id: searchId, filename, keyword, city, total_results: data.length }))
                    .catch(reject);
            }
        );
    });
}

function saveResults(searchId, rows) {
    return new Promise((resolve, reject) => {
        if (!db || !rows.length) return resolve();
        const stmt = db.prepare(`INSERT INTO results 
            (search_id, name, address, phone, website, rating, reviews_count, category, email, latitude, longitude)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

        rows.forEach(row => {
            stmt.run([
                searchId,
                row.name || row.Nome || row.title || '',
                row.address || row.Endereço || row.endereco || '',
                row.phone || row.Telefone || row.telefone || '',
                row.website || row.Website || row.site || '',
                parseFloat(row.rating || row.Rating || row.avaliacao || 0) || 0,
                parseInt(row.reviews_count || row.Avaliações || row.reviews || 0) || 0,
                row.category || row.Categoria || row.categoria || '',
                row.email || row.Email || '',
                parseFloat(row.latitude || row.lat || 0) || 0,
                parseFloat(row.longitude || row.lng || row.lon || 0) || 0,
            ]);
        });

        stmt.finalize(err => err ? reject(err) : resolve());
    });
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

function getResults(searchId, { page = 1, limit = 50, filters = {} } = {}) {
    return new Promise((resolve, reject) => {
        if (!db) return resolve({ data: [], total: 0, page, limit });

        const offset = (page - 1) * limit;
        let where = 'WHERE search_id = ?';
        const params = [searchId];

        if (filters.name) { where += ' AND name LIKE ?'; params.push(`%${filters.name}%`); }
        if (filters.category) { where += ' AND category LIKE ?'; params.push(`%${filters.category}%`); }

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
    getSearches,
    getResults,
    getDashboardMetrics,
    getRecentSearches,
};
