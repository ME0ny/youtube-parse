// shared/logger.js

const LOG_STORAGE_KEY = 'appLogs';
const MAX_LOGS = 500; // ограничим, чтобы не раздувать storage

/**
 * Добавляет запись в журнал
 * @param {string} message
 * @param {string} level — "info", "error", "success", "warn"
 */
async function log(message, level = "info") {
    const logEntry = {
        id: Date.now() + Math.random().toString(36).substr(2, 9),
        timestamp: Date.now(),
        message,
        level
    };

    // Получаем текущие логи
    const logs = await getLogs();

    // Добавляем новую запись
    logs.push(logEntry);

    // Ограничиваем размер
    if (logs.length > MAX_LOGS) {
        logs.splice(0, logs.length - MAX_LOGS);
    }

    // Сохраняем
    await saveLogs(logs);

    // Рассылаем в popup (если открыт)
    broadcastLog(logEntry);

    // Также логируем в консоль background/content
    console.log(`[${level.toUpperCase()}] ${message}`);

    return logEntry;
}

/**
 * Возвращает все логи
 * @returns {Promise<Array>}
 */
async function getLogs() {
    return new Promise((resolve) => {
        chrome.storage.local.get([LOG_STORAGE_KEY], (result) => {
            resolve(result[LOG_STORAGE_KEY] || []);
        });
    });
}

/**
 * Сохраняет массив логов
 * @param {Array} logs
 * @returns {Promise<void>}
 */
async function saveLogs(logs) {
    return new Promise((resolve) => {
        chrome.storage.local.set({ [LOG_STORAGE_KEY]: logs }, () => {
            resolve();
        });
    });
}

/**
 * Очищает журнал
 * @returns {Promise<void>}
 */
async function clearLogs() {
    return new Promise((resolve) => {
        chrome.storage.local.remove([LOG_STORAGE_KEY], () => {
            // Рассылаем событие очистки
            chrome.runtime.sendMessage({
                type: "logsCleared"
            });
            resolve();
        });
    });
}

/**
 * Рассылает одну запись лога всем слушателям (popup)
 * @param {Object} logEntry
 */
function broadcastLog(logEntry) {
    chrome.runtime.sendMessage({
        type: "newLog",
        log: logEntry
    });
}

// Экспортируем для использования в background и popup
window.AppLogger = {
    log,
    getLogs,
    clearLogs
};