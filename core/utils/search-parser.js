// core/utils/search-parser.js

/**
 * Отправляет сообщение в content script для парсинга поисковой выдачи.
 * @param {Object} context - Контекст сценария.
 * @param {string} searchQuery - Поисковый запрос.
 * @returns {Promise<Object>} Результат парсинга.
 */
export async function parseAndHighlightSearch(context, searchQuery) {
    const { log, tabId } = context;
    if (typeof tabId !== 'number' || tabId < 0) {
        throw new Error(`Недействительный tabId для парсинга поиска: ${tabId}`);
    }
    log(`🔍 Отправка запроса на парсинг поисковой выдачи по запросу: "${searchQuery}"...`, { module: 'SearchParser' });
    try {
        const response = await chrome.tabs.sendMessage(tabId, {
            action: "parseAndHighlightSearch",
            searchQuery: searchQuery
        });
        if (response && response.status === "success") {
            const count = response.highlightedCount;
            const data = response.scrapedData || [];
            log(`✅ Парсинг поиска завершен. Найдено/подсвечено видео: ${count}, извлечено данных: ${data.length}`, { module: 'SearchParser' });
            return response;
        } else {
            throw new Error(response?.message || "Неизвестная ошибка парсинга поиска");
        }
    } catch (err) {
        log(`❌ Ошибка связи при парсинге поиска: ${err.message}`, { module: 'SearchParser', level: 'error' });
        throw err;
    }
}