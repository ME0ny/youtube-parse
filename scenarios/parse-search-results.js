// scenarios/parse-search-results.js

import { logger } from '../background/background.js';
import { tableAdapter } from '../background/background.js';
import { parseAndHighlightSearch } from '../core/utils/search-parser.js';
import { scrollPageNTimes } from '../core/utils/scroller.js';
import { addScrapedData as updateIndexManager } from '../core/index-manager.js';

/**
 * @type {import('../core/types/scenario.types.js').ScenarioDefinition}
 */
export const parseSearchResultsScenario = {
    id: 'parse-search-results',
    name: 'Парсинг поисковой выдачи',
    description: 'Прокручивает поисковую выдачу, парсит видео и сохраняет данные.',

    /**
     * @param {import('../core/types/scenario.types.js').ScenarioContext} context
     */
    async execute(context) {
        const { log, params = {}, tabId, abortSignal } = context;

        // --- 1. Получаем поисковый запрос из URL текущей вкладки ---
        let searchQuery = 'unknown_search';
        if (typeof tabId === 'number' && tabId > 0) {
            try {
                const tab = await chrome.tabs.get(tabId);
                const url = new URL(tab.url);
                searchQuery = url.searchParams.get('search_query') || 'unknown_search';
            } catch (e) {
                log(`⚠️ Не удалось извлечь поисковый запрос из URL: ${e.message}`, { module: 'ParseSearchResults', level: 'warn' });
            }
        }
        log(`🔍 Запущен сценарий "Парсинг поисковой выдачи" по запросу: "${searchQuery}"`, { module: 'ParseSearchResults' });

        // --- 2. Скроллинг страницы (как в parse-recommendation) --- parseInt(params.count, 10) || 16
        const scrollParams = {
            count: 64,
            delayMs: parseInt(params.delayMs, 10) || 1500,
            step: parseInt(params.step, 10) || 1000
        };
        log(`🔄 Выполняем скроллинг поисковой выдачи: ${scrollParams.count} раз(а)...`, { module: 'ParseSearchResults' });
        await scrollPageNTimes(context, scrollParams.count, scrollParams.delayMs, scrollParams.step);
        log(`✅ Скроллинг завершён.`, { module: 'ParseSearchResults' });

        // --- 3. Парсинг и подсветка ---
        const parseResult = await parseAndHighlightSearch(context, searchQuery);
        const scrapedData = parseResult.scrapedData || [];

        if (scrapedData.length === 0) {
            log(`⚠️ Парсинг не нашел ни одного видео.`, { module: 'ParseSearchResults', level: 'warn' });
            return;
        }

        // --- 4. Сохранение данных ---
        log(`💾 Сохранение ${scrapedData.length} записей в таблицу...`, { module: 'ParseSearchResults' });
        try {
            const dataToSave = scrapedData.map(item => ({
                ...item,
                timestamp: Date.now(),
                isImported: false
            }));
            await tableAdapter.addBatch(dataToSave);
            log(`✅ Успешно сохранено ${dataToSave.length} записей.`, { module: 'ParseSearchResults' });
        } catch (saveErr) {
            log(`❌ Ошибка сохранения данных: ${saveErr.message}`, { module: 'ParseSearchResults', level: 'error' });
        }
    }
};