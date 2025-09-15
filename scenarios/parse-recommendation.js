
// scenarios/parse-recommendation.js
import { scrollPageNTimes } from '../core/utils/scroller.js';
import { parseAndHighlight, removeParserHighlights } from '../core/utils/parser.js';
import { addScrapedData as updateIndexManager } from '../core/index-manager.js';
import { logger } from '../background/background.js'; // Убедись, что logger доступен
import { tableAdapter } from '../background/background.js'; // 👈 НОВОЕ: Импорт tableAdapter

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
            const scrapedData = parseResult.scrapedData || [];

            log(`✅ Найдено и подсвечено ${highlightedCount} видео.`, { module: 'ParseRecommendation' });

            // Для отладки: логируем количество полученных HTML
            log(`📄 Получено HTML-кодов карточек: ${scrapedData?.length || 0}`, { module: 'ParseRecommendation' });

            if (scrapedData.length > 0) {
                log(`🔄 Обновление индексов IndexManager данными по ${scrapedData.length} видео...`, { module: 'ParseRecommendation' });
                try {
                    // Передаем извлеченные данные в IndexManager
                    updateIndexManager(scrapedData);
                    log(`✅ Индексы IndexManager успешно обновлены.`, { module: 'ParseRecommendation' });
                } catch (indexUpdateErr) {
                    log(`❌ Ошибка обновления индексов IndexManager: ${indexUpdateErr.message}`, { module: 'ParseRecommendation', level: 'error' });
                    // Не прерываем сценарий из-за ошибки обновления индексов, это вторично
                }
            } else {
                log(`ℹ️ Нет новых данных для обновления индексов.`, { module: 'ParseRecommendation' });
            }
            // --- 4. Загрузить данные в таблицу
            if (scrapedData.length > 0) {
                log(`💾 Сохранение ${scrapedData.length} записей в таблицу...`, { module: 'ParseRecommendation' });
                try {
                    // Добавляем временной штамп, если его нет
                    const dataToSave = scrapedData.map(item => ({
                        ...item,
                        timestamp: item.timestamp || Date.now() // Добавляем timestamp, если отсутствует
                    }));

                    // Используем tableAdapter для сохранения данных
                    // Предполагается, что tableAdapter.addBatch существует
                    if (typeof tableAdapter.addBatch === 'function') {
                        await tableAdapter.addBatch(dataToSave);
                        log(`✅ ${dataToSave.length} записей успешно сохранены в таблицу.`, { module: 'ParseRecommendation' });
                    } else if (typeof tableAdapter.add === 'function') {
                        // Если addBatch нет, добавляем по одной (менее эффективно)
                        log(`⚠️ tableAdapter.addBatch не найден, сохраняем по одной записи...`, { module: 'ParseRecommendation', level: 'warn' });
                        let savedCount = 0;
                        for (const item of dataToSave) {
                            try {
                                await tableAdapter.add(item);
                                savedCount++;
                            } catch (addItemErr) {
                                log(`❌ Ошибка сохранения одной записи: ${addItemErr.message}`, { module: 'ParseRecommendation', level: 'error' });
                                // Не прерываем весь процесс из-за одной ошибки
                            }
                        }
                        log(`✅ ${savedCount}/${dataToSave.length} записей успешно сохранены в таблицу (по одной).`, { module: 'ParseRecommendation' });
                    } else {
                        throw new Error("Адаптер таблицы не поддерживает методы добавления (add/addBatch)");
                    }

                } catch (saveErr) {
                    log(`❌ Ошибка сохранения данных в таблицу: ${saveErr.message}`, { module: 'ParseRecommendation', level: 'error' });
                    // Не прерываем сценарий из-за ошибки сохранения, это вторично
                }
            } else {
                log(`ℹ️ Нет новых данных для сохранения в таблицу.`, { module: 'ParseRecommendation' });
            }
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
