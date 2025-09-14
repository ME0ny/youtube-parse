
// scenarios/parse-recommendation.js
import { scrollPageNTimes } from '../core/utils/scroller.js';
import { parseAndHighlight, removeParserHighlights } from '../core/utils/parser.js';
// import { logger } from '../background/background.js'; // Будет использоваться через context.log

/**
 * @type {import('../core/types/scenario.types.js').ScenarioDefinition}
 */
export const parseRecommendationScenario = {
    id: 'parse-recommendation',
    name: 'Парсинг рекомендаций',
    description: 'Прокручивает страницу с рекомендациями и готовит данные для парсинга.',

    /**
     * @param {import('../core/types/scenario.types.js').ScenarioContext} context
     */
    async execute(context) {
        const { log, params = {}, tabId, abortSignal } = context;
        console.log("[ParseRecommendation] Начало выполнения, context:", { params, tabId }); // <-- Лог

        // Параметры по умолчанию, как указано в задаче
        const scrollParams = {
            count: parseInt(params.count, 10) || 16,
            delayMs: parseInt(params.delayMs, 10) || 1500,
            step: parseInt(params.step, 10) || 1000
        };

        log(`🚀 Сценарий "Парсинг рекомендаций" запущен.`, { module: 'ParseRecommendation' });
        log(`🔧 Параметры скроллинга: ${JSON.stringify(scrollParams)}`, { module: 'ParseRecommendation' });

        try {
            // Проверяем, не было ли запроса на остановку до начала
            log(`⏳ Проверка abortSignal перед скроллингом...`, { module: 'ParseRecommendation' });
            await abortSignal();
            log(`✅ Проверка abortSignal пройдена.`, { module: 'ParseRecommendation' });

            // --- 1. Скроллинг страницы ---
            log(`🔄 Вызов scrollPageNTimes...`, { module: 'ParseRecommendation' });
            await scrollPageNTimes(context, scrollParams.count, scrollParams.delayMs, scrollParams.step);
            log(`✅ scrollPageNTimes завершен.`, { module: 'ParseRecommendation' });

            // --- 2. Парсинг и подсветка ---
            await removeParserHighlights(context);

            const parseResult = await parseAndHighlight(context);
            const highlightedCount = parseResult.highlightedCount;
            const scrapedData = parseResult.scrapedData;

            log(`✅ Найдено и подсвечено ${highlightedCount} видео.`, { module: 'ParseRecommendation' });

            // Для отладки: логируем количество полученных HTML
            log(`📄 Получено HTML-кодов карточек: ${scrapedData?.length || 0}`, { module: 'ParseRecommendation' });

            // --- 3. TODO: Скрапинг данных (в следующем шаге) ---
            // const scrapedData = await scrapeCards(context, parsedCards);
            // log(`💾 Скрапинг завершён. Получено данных по ${scrapedData.length} видео.`, { module: 'ParseRecommendation' });

            // --- 4. TODO: Сохранение данных (в следующем шаге) ---
            // await saveData(context, scrapedData);

            log(`🎉 Сценарий "Парсинг рекомендаций" успешно завершён.`, { module: 'ParseRecommendation' });

        } catch (error) {
            console.error("[ParseRecommendation] Поймано исключение:", error); // <-- Лог ошибок

            if (error.message === 'Сценарий остановлен пользователем.') {
                log(`⏹️ Сценарий "Парсинг рекомендаций" остановлен пользователем.`, { module: 'ParseRecommendation', level: 'warn' });
            } else {
                log(`❌ Ошибка в сценарии "Парсинг рекомендаций": ${error.message}`, { module: 'ParseRecommendation', level: 'error' });
                throw error; // Перебрасываем ошибку для обработки в ScenarioEngine
            }
        }
    }
};
