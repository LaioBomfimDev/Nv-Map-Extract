const path = require('path');
const fs = require('fs');
const csv = require('csv-parser');
const XLSX = require('xlsx');
const logger = require('../utils/logger');
const dataService = require('./dataService');

let watcher = null;

function startWatching(watchPath) {
    return new Promise((resolve, reject) => {
        try {
            // Garantir que a pasta existe
            if (!fs.existsSync(watchPath)) {
                fs.mkdirSync(watchPath, { recursive: true });
                logger.info('Pasta resultados/ criada', { path: watchPath });
            }

            const chokidar = require('chokidar');
            watcher = chokidar.watch(watchPath, {
                ignored: /(^|[\/\\])\../,
                persistent: true,
                ignoreInitial: false,
                awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 100 },
            });

            watcher.on('add', (filePath) => {
                if (isValidScrapeFile(filePath)) {
                    logger.info('Novo arquivo detectado', { file: path.basename(filePath) });
                    processFile(filePath);
                }
            });

            watcher.on('error', (error) => logger.error('Erro no FileWatcher', { error: error.message }));

            logger.info('FileWatcher ativo', { path: watchPath });
            resolve();
        } catch (e) {
            logger.error('Falha ao iniciar FileWatcher', { error: e.message });
            resolve(); // não bloqueia o servidor
        }
    });
}

function isValidScrapeFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (!['.csv', '.xlsx', '.xls'].includes(ext)) return false;
    const name = path.basename(filePath).toLowerCase();
    const keywords = ['google_maps', 'search_result', 'extract', 'scraper', 'business', 'places', 'results', 'maps'];
    return keywords.some(k => name.includes(k)) || ext === '.csv'; // aceita qualquer CSV
}

function processFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.csv') {
        parseCsv(filePath);
    } else if (['.xlsx', '.xls'].includes(ext)) {
        parseXlsx(filePath);
    } else {
        logger.warn('Formato não suportado pelo FileWatcher', { file: filePath });
    }
}

function parseCsv(filePath) {
    const rows = [];
    fs.createReadStream(filePath)
        .pipe(csv({ separator: ',' }))
        .on('data', (row) => rows.push(row))
        .on('end', async () => {
            if (rows.length === 0) {
                logger.warn('Arquivo CSV vazio', { file: path.basename(filePath) });
                return;
            }
            try {
                const result = await dataService.saveSearch(path.basename(filePath), rows);
                logger.info('Arquivo CSV processado com sucesso', {
                    file: path.basename(filePath),
                    records: rows.length,
                    searchId: result.id,
                });
            } catch (e) {
                logger.error('Erro ao salvar dados do CSV', { error: e.message, file: filePath });
            }
        })
        .on('error', (e) => logger.error('Erro ao ler CSV', { error: e.message, file: filePath }));
}

function parseXlsx(filePath) {
    try {
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet);

        if (rows.length === 0) {
            logger.warn('Arquivo Excel vazio', { file: path.basename(filePath) });
            return;
        }

        dataService.saveSearch(path.basename(filePath), rows)
            .then((result) => {
                logger.info('Arquivo Excel processado com sucesso', {
                    file: path.basename(filePath),
                    records: rows.length,
                    searchId: result.id,
                });
            })
            .catch((e) => {
                logger.error('Erro ao salvar dados do Excel', { error: e.message, file: filePath });
            });
    } catch (e) {
        logger.error('Erro ao ler Excel', { error: e.message, file: filePath });
    }
}

function stopWatching() {
    if (watcher) {
        watcher.close();
        logger.info('FileWatcher encerrado');
    }
}

// Processar arquivo manualmente (upload)
function processUploadedFile(filePath, originalName = '') {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(filePath)) return reject(new Error('Arquivo não encontrado'));
        const ext = path.extname(originalName || filePath).toLowerCase();
        if (!['.csv', '.xlsx', '.xls'].includes(ext)) {
            return reject(new Error('Apenas arquivos CSV, XLSX e XLS são suportados'));
        }

        if (ext === '.csv') {
            const rows = [];
            fs.createReadStream(filePath)
                .pipe(csv())
                .on('data', row => rows.push(row))
                .on('end', async () => {
                    try {
                        const result = await dataService.saveSearch(path.basename(originalName || filePath), rows);
                        resolve({ ...result, records: rows.length });
                    } catch (e) { reject(e); }
                })
                .on('error', reject);
        } else {
            try {
                const workbook = XLSX.readFile(filePath);
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const rows = XLSX.utils.sheet_to_json(worksheet);

                dataService.saveSearch(path.basename(originalName || filePath), rows)
                    .then((result) => resolve({ ...result, records: rows.length }))
                    .catch(reject);
            } catch (e) {
                reject(e);
            }
        }
    });
}

module.exports = { startWatching, stopWatching, processUploadedFile };
