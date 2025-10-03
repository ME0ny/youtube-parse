// core/utils/search-query-selector.js
import { getStateSnapshot } from '../index-manager.js';

/**
 * Выбирает следующий непосещённый поисковый запрос.
 * Посещённые запросы хранятся в visitedVideoIds (где sourceVideoId = запрос).
 * @param {Array} scrapedData - не используется, но сохранён для совместимости
 * @param {Object} indexSnapshot - снимок индексов
 * @param {Function} log - логгер
 * @returns {string|null}
 */
export async function selectNextSearchQuery(scrapedData, indexSnapshot, log) {
    try {
        const result = await chrome.storage.local.get(['searchQueries']);
        const allQueries = result.searchQueries || [];

        if (allQueries.length === 0) {
            log(`ℹ️ Список поисковых запросов пуст.`, { module: 'SearchQuerySelector' });
            return null;
        }

        // 👇 Используем НОВУЮ структуру
        const visitedQueries = indexSnapshot.visitedSearchQueries;

        for (const query of allQueries) {
            const cleanQuery = query.trim();
            if (cleanQuery && !visitedQueries.has(cleanQuery)) {
                log(`✅ Найден непосещённый запрос: "${cleanQuery}"`, { module: 'SearchQuerySelector' });
                return cleanQuery;
            }
        }

        log(`ℹ️ Все ${allQueries.length} запросов уже посещены.`, { module: 'SearchQuerySelector' });
        return null;

    } catch (err) {
        log(`❌ Ошибка выбора следующего запроса: ${err.message}`, { module: 'SearchQuerySelector', level: 'error' });
        return null;
    }
}