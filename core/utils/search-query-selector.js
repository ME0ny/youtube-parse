// core/utils/search-query-selector.js

/**
 * Выбирает следующий поисковый запрос на основе текущих данных.
 * Пока возвращает фиксированный запрос для тестирования.
 * @param {Array} scrapedData - Данные, полученные в текущей итерации.
 * @param {Object} indexSnapshot - Снимок индексов (visitedVideoIds, channelVideoCounts и т.д.)
 * @param {Function} log - Функция логирования.
 * @returns {string|null} Новый поисковый запрос или null, если не найден.
 */
export function selectNextSearchQuery(scrapedData, indexSnapshot, log) {
    // TODO: Реализовать логику выбора запроса на основе каналов, трендов и т.д.
    // Пока возвращаем фиксированный запрос для теста
    const nextQuery = "Сочи";
    log(`🔍 Выбран следующий поисковый запрос: "${nextQuery}"`, { module: 'SearchQuerySelector' });
    return nextQuery;
}