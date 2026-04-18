const fs = require('fs');
const path = require('path');

const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL || 'info'];

const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

function formatMessage(level, message, meta) {
    const ts = new Date().toISOString();
    const metaStr = meta ? ' ' + JSON.stringify(meta) : '';
    return `[${ts}] [${level.toUpperCase()}] ${message}${metaStr}`;
}

function writeLog(level, message, meta) {
    if (LOG_LEVELS[level] > currentLevel) return;
    const line = formatMessage(level, message, meta);
    console.log(line);
    try {
        const logFile = path.join(logsDir, 'app.log');
        fs.appendFileSync(logFile, line + '\n');
    } catch (e) { /* silently fail */ }
}

module.exports = {
    info:  (msg, meta) => writeLog('info',  msg, meta),
    warn:  (msg, meta) => writeLog('warn',  msg, meta),
    error: (msg, meta) => writeLog('error', msg, meta),
    debug: (msg, meta) => writeLog('debug', msg, meta),
};
