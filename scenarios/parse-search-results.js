// scenarios/parse-search-results.js

import { logger } from '../background/background.js';
import { tableAdapter } from '../background/background.js';
import { parseAndHighlightSearch } from '../core/utils/search-parser.js';
import { scrollPageNTimes } from '../core/utils/scroller.js';
import { getStateSnapshot } from '../core/index-manager.js';
import { addScrapedData as updateIndexManager } from '../core/index-manager.js';
import { calculateNewChannelsInIteration, calculateRussianChannelRatio } from '../core/utils/metrics.js';

function filterUniqueVideos(newVideos, existingVideoIds) {
    return newVideos.filter(video => !existingVideoIds.has(video.videoId));
}

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

        // === НОВЫЕ ПЕРЕМЕННЫЕ ===
        const russianChannelBuffer = []; // последние 5 значений
        const BUFFER_SIZE = 5;
        let lowPerformanceCounter = 0;  // счётчик для диапазона [5, 7)
        let totalIterations = 0;
        const MAX_LOW_PERF_ITERATIONS = 2;

        // Получаем начальный набор videoId из таблицы (для дедупликации)
        let existingVideoIds = new Set();
        try {
            const allData = await tableAdapter.getAll();
            existingVideoIds = new Set(allData.map(item => item.videoId).filter(id => id));
            log(`📊 Загружено ${existingVideoIds.size} существующих videoId для дедупликации.`, { module: 'ParseSearchResults' });
        } catch (e) {
            log(`⚠️ Не удалось загрузить существующие videoId: ${e.message}`, { module: 'ParseSearchResults', level: 'warn' });
        }

        // === ЦИКЛ ИТЕРАЦИЙ ===
        while (true) {
            await abortSignal();
            totalIterations++;
            log(`🔄 === ИТЕРАЦИЯ ${totalIterations} СЦЕНАРИЯ "ПАРСИНГ ПОИСКОВОЙ ВЫДАЧИ" ===`, { module: 'ParseSearchResults' });

            // --- 1. Получаем поисковый запрос ---
            let searchQuery = 'unknown_search';
            if (typeof tabId === 'number' && tabId > 0) {
                try {
                    const tab = await chrome.tabs.get(tabId);
                    const url = new URL(tab.url);
                    searchQuery = url.searchParams.get('search_query') || 'unknown_search';
                } catch (e) {
                    log(`⚠️ Не удалось извлечь поисковый запрос: ${e.message}`, { module: 'ParseSearchResults', level: 'warn' });
                }
            }

            // --- 2. Скроллинг ---
            const scrollParams = {
                count: parseInt(params.count, 10) || 16,
                delayMs: parseInt(params.delayMs, 10) || 1500,
                step: parseInt(params.step, 10) || 1000
            };
            await scrollPageNTimes(context, scrollParams.count, scrollParams.delayMs, scrollParams.step);

            // --- 3. Парсинг ---
            const parseResult = await parseAndHighlightSearch(context, searchQuery);
            let scrapedData = parseResult.scrapedData || [];

            if (scrapedData.length === 0) {
                log(`⚠️ Нет данных для анализа.`, { module: 'ParseSearchResults', level: 'warn' });
                russianChannelBuffer.push(0);
                break; // завершаем, если ничего нет
            }

            // --- 4. Анализ новых русских каналов ---
            let russianChannelCount = 0;
            try {
                const indexSnapshot = getStateSnapshot();
                const newChannelsResult = calculateNewChannelsInIteration(scrapedData, indexSnapshot.channelVideoCounts, log);
                if (newChannelsResult.newChannelCount > 0) {
                    const russianMetrics = calculateRussianChannelRatio(
                        newChannelsResult.newChannelNames,
                        scrapedData,
                        log
                    );
                    russianChannelCount = russianMetrics.russianChannelCount;
                }
            } catch (e) {
                log(`❌ Ошибка анализа русскости: ${e.message}`, { module: 'ParseSearchResults', level: 'error' });
            }

            // --- 5. Обновляем буфер ---
            russianChannelBuffer.push(russianChannelCount);
            if (russianChannelBuffer.length > BUFFER_SIZE) {
                russianChannelBuffer.shift();
            }
            const currentAverage = russianChannelBuffer.reduce((a, b) => a + b, 0) / russianChannelBuffer.length;

            // --- 6. Отправляем текущее значение в UI ---
            logger.updateMetric('russianChannelsInSearch', currentAverage, { format: '0' });
            log(`📈 Текущее значение: ${currentAverage}, среднее за ${russianChannelBuffer.length} итераций: ${currentAverage.toFixed(2)}`, { module: 'ParseSearchResults' });

            // --- 7. Фильтрация уникальных видео ---
            const uniqueVideos = filterUniqueVideos(scrapedData, existingVideoIds);
            log(`🆕 Уникальных видео для сохранения: ${uniqueVideos.length} из ${scrapedData.length}`, { module: 'ParseSearchResults' });

            // --- 8. Сохранение и обновление индексов (только уникальные) ---
            if (uniqueVideos.length > 0) {
                // Сохраняем в таблицу
                const dataToSave = uniqueVideos.map(item => ({
                    ...item,
                    timestamp: Date.now(),
                    isImported: false
                }));
                await tableAdapter.addBatch(dataToSave);
                log(`✅ Сохранено ${dataToSave.length} новых записей.`, { module: 'ParseSearchResults' });

                // Обновляем индексы
                updateIndexManager(uniqueVideos);
                log(`✅ Индексы обновлены.`, { module: 'ParseSearchResults' });

                // Обновляем existingVideoIds для следующей итерации
                uniqueVideos.forEach(v => existingVideoIds.add(v.videoId));
            } else {
                log(`ℹ️ Нет новых видео для сохранения.`, { module: 'ParseSearchResults' });
            }

            // --- 9. Принятие решения о продолжении ---
            if (currentAverage >= 7) {
                log(`✅ Среднее ≥7. Продолжаем парсинг.`, { module: 'ParseSearchResults', level: 'success' });
                lowPerformanceCounter = 0; // сбрасываем счётчик низкой эффективности
                continue;
            } else if (currentAverage >= 5) {
                lowPerformanceCounter++;
                log(`⚠️ Среднее в диапазоне [5, 7). Счётчик: ${lowPerformanceCounter}/${MAX_LOW_PERF_ITERATIONS}`, { module: 'ParseSearchResults', level: 'warn' });
                if (lowPerformanceCounter >= MAX_LOW_PERF_ITERATIONS) {
                    log(`⏹️ Достигнут лимит (${MAX_LOW_PERF_ITERATIONS}) итераций с низкой эффективностью. Завершение.`, { module: 'ParseSearchResults', level: 'warn' });
                    break;
                }
                continue;
            } else {
                log(`🛑 Среднее <5. Завершение сценария.`, { module: 'ParseSearchResults', level: 'error' });
                break;
            }
        }

        log(`🎉 Сценарий "Парсинг поисковой выдачи" завершён. Всего итераций: ${totalIterations}.`, { module: 'ParseSearchResults', level: 'success' });
    }
};