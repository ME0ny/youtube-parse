// scenarios/parse-search-results.js

import { logger } from '../background/background.js';

/**
 * @type {import('../core/types/scenario.types.js').ScenarioDefinition}
 */
export const parseSearchResultsScenario = {
    id: 'parse-search-results',
    name: 'Парсинг поисковой выдачи',
    description: 'Сценарий для парсинга результатов поиска на YouTube (заглушка).',
    /**
     * @param {import('../core/types/scenario.types.js').ScenarioContext} context
     */
    async execute(context) {
        const { log } = context;
        log(`🔍 Сценарий "Парсинг поисковой выдачи" запущен.`, { module: 'ParseSearchResults' });
        log(`ℹ️ Этот сценарий пока является заглушкой и не выполняет никаких действий.`, { module: 'ParseSearchResults' });
    }
};