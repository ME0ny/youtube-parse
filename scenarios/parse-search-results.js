// scenarios/parse-search-results.js

import { logger } from '../background/background.js';
import { tableAdapter } from '../background/background.js';
import { parseAndHighlightSearch } from '../core/utils/search-parser.js';
import { addScrapedData as updateIndexManager } from '../core/index-manager.js';

/**
 * @type {import('../core/types/scenario.types.js').ScenarioDefinition}
 */
export const parseSearchResultsScenario = {
    id: 'parse-search-results',
    name: 'Парсинг поисковой выдачи',
    description: 'Парсит результаты поиска на YouTube и сохраняет данные.',
    /**
     * @param {import('../core/types/scenario.types.js').ScenarioContext} context
     */
    async execute(context) {
        const { log, params = {}, tabId, abortSignal } = context;

        // --- 1. Получаем поисковый запрос ---
        // Поисковый запрос можно получить из URL текущей вкладки
        let searchQuery = 'unknown_search';
        if (typeof tabId === 'number' && tabId > 0) {
            try {
                const tab = await chrome.tabs.get(tabId);
                const url = new URL(tab.url);
                if (url.pathname === '/results') {
                    searchQuery = url.searchParams.get('search_query') || 'unknown_search';
                    // Декодируем URL-компонент
                    searchQuery = decodeURIComponent(searchQuery.replace(/\+/g, ' '));
                }
            } catch (urlErr) {
                log(`⚠️ Ошибка получения поискового запроса из URL: ${urlErr.message}`, { module: 'ParseSearchResults', level: 'warn' });
            }
        }
        log(`🔍 Запущен сценарий "Парсинг поисковой выдачи" по запросу: "${searchQuery}"`, { module: 'ParseSearchResults' });

        try {
            // --- 2. Парсинг и подсветка ---
            const parseResult = await parseAndHighlightSearch(context, searchQuery);
            const scrapedData = parseResult.scrapedData || [];

            if (scrapedData.length === 0) {
                log(`⚠️ Парсинг не нашел ни одного видео.`, { module: 'ParseSearchResults', level: 'warn' });
                return;
            }

            // --- 3. Сохранение данных в таблицу ---
            log(`💾 Сохранение ${scrapedData.length} записей в таблицу...`, { module: 'ParseSearchResults' });
            try {
                const dataToSave = scrapedData.map(item => ({
                    ...item,
                    timestamp: Date.now()
                }));
                await tableAdapter.addBatch(dataToSave);
                log(`✅ ${dataToSave.length} записей успешно сохранены в таблицу.`, { module: 'ParseSearchResults' });
            } catch (saveErr) {
                log(`❌ Ошибка сохранения данных в таблицу: ${saveErr.message}`, { module: 'ParseSearchResults', level: 'error' });
            }

            // --- 4. Обновление индексов IndexManager ---
            log(`🔄 Обновление индексов IndexManager данными по ${scrapedData.length} видео...`, { module: 'ParseSearchResults' });
            try {
                updateIndexManager(scrapedData);
                log(`✅ Индексы IndexManager успешно обновлены.`, { module: 'ParseSearchResults' });
            } catch (indexUpdateErr) {
                log(`❌ Ошибка обновления индексов IndexManager: ${indexUpdateErr.message}`, { module: 'ParseSearchResults', level: 'error' });
            }

            log(`🎉 Сценарий "Парсинг поисковой выдачи" завершен. Обработано ${scrapedData.length} видео.`, { module: 'ParseSearchResults', level: 'success' });

        } catch (err) {
            log(`❌ Критическая ошибка в сценарии "Парсинг поисковой выдачи": ${err.message}`, { module: 'ParseSearchResults', level: 'error' });
            console.error("[ParseSearchResults] Stack trace:", err);
        }
    }
};