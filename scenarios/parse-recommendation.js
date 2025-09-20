// scenarios/parse-recommendation.js
import { scrollPageNTimes } from '../core/utils/scroller.js';
import { parseAndHighlight, removeParserHighlights } from '../core/utils/parser.js';
import { addScrapedData as updateIndexManager } from '../core/index-manager.js';
import { logger } from '../background/background.js';
import { tableAdapter } from '../background/background.js';
import { getUnavailableVideoIds, addUnavailableVideoIds } from '../core/utils/blacklist.js';
import { selectNextVideo, isLikelyRussian } from '../core/utils/video-selector.js';
import { getStateSnapshot } from '../core/index-manager.js';
import { navigateToVideo } from '../core/utils/navigator.js';
import { calculateNewChannelsInIteration, calculateRussianChannelRatio, updateRussianChannelMetric } from '../core/utils/metrics.js'; // <-- НОВЫЙ ИМПОРТ


/**
 * @type {import('../core/types/scenario.types.js').ScenarioDefinition}
 */
export const parseRecommendationScenario = {
    id: 'parse-recommendation',
    name: 'Парсинг рекомендаций',
    description: 'Прокручивает страницу с рекомендациями, парсит видео и переходит к следующему.',

    /**
     * @param {import('../core/types/scenario.types.js').ScenarioContext} context
     */
    async execute(context) {
        const { log, params = {}, tabId, abortSignal } = context;
        console.log("[ParseRecommendation] Начало выполнения, context:", { params, tabId });

        // --- Параметры по умолчанию ---
        const totalRequestedIterations = parseInt(params.iterations, 10) || 1;
        const scrollParams = {
            count: parseInt(params.count, 10) || 16,
            delayMs: parseInt(params.delayMs, 10) || 1500,
            step: parseInt(params.step, 10) || 1000
        };
        const selectionModeInternal = params.mode || 'all_videos';
        const maxRetriesPerIteration = 3; // Максимальное количество попыток на одну итерацию

        log(`🚀 Сценарий "Парсинг рекомендаций" запущен.`, { module: 'ParseRecommendation' });
        log(`🔢 Запрошено итераций: ${totalRequestedIterations}`, { module: 'ParseRecommendation' });
        log(`🔧 Параметры скроллинга: ${JSON.stringify(scrollParams)}`, { module: 'ParseRecommendation' });
        log(`🧠 Алгоритм выбора следующего видео: ${selectionModeInternal}`, { module: 'ParseRecommendation' });

        let successfulTransitions = 0; // Фактически выполненные переходы
        let noTransitionStreak = 0; // Счетчик итераций без перехода
        const maxNoTransitionStreak = 3; // Максимум итераций без перехода до остановки

        // --- Цикл итераций ---
        // Итерации продолжаются, пока не выполнено totalRequestedIterations переходов
        // или не исчерпан лимит попыток без перехода
        while (successfulTransitions < totalRequestedIterations && noTransitionStreak < maxNoTransitionStreak) {

            const currentIterationNumber = successfulTransitions + 1;
            log(`🔄 === НАЧАЛО ИТЕРАЦИИ ${currentIterationNumber}/${totalRequestedIterations} (Попытка перехода ${successfulTransitions + 1}) ===`, { module: 'ParseRecommendation' });

            // Проверка на остановку перед началом итерации
            try {
                await abortSignal();
            } catch (abortErr) {
                log(`⏹️ Сценарий остановлен пользователем. Выполнено переходов: ${successfulTransitions}/${totalRequestedIterations}.`, { module: 'ParseRecommendation', level: 'warn' });
                return; // Завершаем весь сценарий
            }

            let attempt = 1;
            let iterationCompletedWithTransition = false; // Флаг успешного перехода в этой "попытке" итерации

            // --- Цикл попыток для текущей "логической" итерации ---
            while (attempt <= maxRetriesPerIteration && !iterationCompletedWithTransition) {
                log(`🔁 Попытка ${attempt}/${maxRetriesPerIteration} для итерации ${currentIterationNumber}...`, { module: 'ParseRecommendation' });

                try {
                    // --- 0. Проверка доступности текущего видео ---
                    log(`🔒 Проверка доступности текущего видео...`, { module: 'ParseRecommendation' });
                    let isCurrentVideoAvailable = true;
                    let currentVideoIdForCheck = 'unknown_current_video';

                    if (typeof tabId === 'number' && tabId > 0) {
                        try {
                            const tab = await chrome.tabs.get(tabId);
                            const url = new URL(tab.url);
                            currentVideoIdForCheck = url.searchParams.get('v') || 'unknown_video_id_from_url';

                            const checkResponse = await chrome.tabs.sendMessage(tabId, {
                                action: "checkVideoAvailability"
                            });

                            if (checkResponse && checkResponse.status === "success") {
                                isCurrentVideoAvailable = checkResponse.isAvailable;
                                log(`🔒 Результат проверки для ${currentVideoIdForCheck}: ${isCurrentVideoAvailable ? 'Доступно' : 'Недоступно'}`, { module: 'ParseRecommendation', level: isCurrentVideoAvailable ? 'info' : 'warn' });
                            } else {
                                const checkErrorMsg = checkResponse?.message || "Неизвестная ошибка проверки";
                                log(`⚠️ Ошибка проверки доступности: ${checkErrorMsg}`, { module: 'ParseRecommendation', level: 'warn' });
                            }
                        } catch (urlOrCheckErr) {
                            log(`⚠️ Ошибка связи при проверке доступности: ${urlOrCheckErr.message}`, { module: 'ParseRecommendation', level: 'warn' });
                        }
                    }

                    if (!isCurrentVideoAvailable) {
                        log(`🔒 Текущее видео (${currentVideoIdForCheck}) недоступно. Добавляем в черный список и завершаем итерацию.`, { module: 'ParseRecommendation', level: 'error' });
                        await addUnavailableVideoIds(currentVideoIdForCheck);
                        // Завершаем попытки для этой логической итерации, не увеличивая successfulTransitions
                        break; // Выходим из while(attempt...), что приведет к переходу к следующей логической итерации
                    }

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
                    log(`📄 Получено HTML-кодов карточек: ${scrapedData?.length || 0}`, { module: 'ParseRecommendation' });

                    // --- Критическая проверка: Если данных нет, итерация не может быть успешной ---
                    if (scrapedData.length === 0) {
                        log(`🛑 Парсинг не нашел данных. Итерация ${currentIterationNumber} не может быть завершена.`, { module: 'ParseRecommendation', level: 'warn' });
                        // Не увеличиваем successfulTransitions, не сбрасываем noTransitionStreak, так как перехода не было
                        // Просто завершаем попытки этой итерации
                        break; // Выходим из while(attempt...)
                    }

                    // Расчет метрики по уникальности каналов
                    log(`📊 Расчет метрик новых каналов...`, { module: 'ParseRecommendation' });
                    const indexSnapshot = getStateSnapshot();
                    const metricsResult = calculateNewChannelsInIteration(scrapedData, indexSnapshot.channelVideoCounts, log);
                    let currentAverage = 0;

                    log(`📈 Найдено новых каналов в этой итерации: ${metricsResult.newChannelCount}`, { module: 'ParseRecommendation', level: metricsResult.newChannelCount > 0 ? 'success' : 'info' });
                    if (metricsResult.newChannelCount > 0) {
                        log(`🇷🇺 Анализ "русскости" новых каналов (первая итерация)...`, { module: 'ParseRecommendation' });
                        try {
                            // 👇 ПЕРЕДАЕМ ТОЛЬКО newChannelNames и scrapedData
                            const russianMetrics = calculateRussianChannelRatio(
                                metricsResult.newChannelNames,
                                scrapedData, // <-- Только текущая итерация
                                log // <-- Логгер
                            );
                            log(`🇷🇺 Среди ${russianMetrics.totalChannels} новых каналов, русскими являются ${russianMetrics.russianChannelCount} (${russianMetrics.ratio}%).`, { module: 'ParseRecommendation', level: 'success' });
                            currentAverage = updateRussianChannelMetric(russianMetrics.russianChannelCount, log);
                            // if (russianMetrics.russianChannelList.length > 0) {
                            //     log(`🇷🇺 Список русских каналов: ${russianMetrics.russianChannelList.join(', ')}`, { module: 'ParseRecommendation' });
                            // }
                        } catch (russianErr) {
                            log(`⚠️ Ошибка анализа русскости каналов: ${russianErr.message}`, { module: 'ParseRecommendation', level: 'warn' });
                        }
                    }
                    else {
                        currentAverage = updateRussianChannelMetric(0, log);
                    }
                    log(`Проверяем currentAverage ${currentAverage}`, { module: 'ParseRecommendation', level: 'warn' });
                    logger.updateMetric('russianChannelAverage', currentAverage, { format: '2' });

                    // --- 3. Обновление индексов IndexManager ---
                    log(`🔄 Обновление индексов IndexManager данными по ${scrapedData.length} видео...`, { module: 'ParseRecommendation' });
                    try {
                        updateIndexManager(scrapedData);
                        log(`✅ Индексы IndexManager успешно обновлены.`, { module: 'ParseRecommendation' });
                    } catch (indexUpdateErr) {
                        log(`❌ Ошибка обновления индексов IndexManager: ${indexUpdateErr.message}`, { module: 'ParseRecommendation', level: 'error' });
                    }



                    // --- 4. Сохранение данных в таблицу ---
                    log(`💾 Сохранение ${scrapedData.length} записей в таблицу...`, { module: 'ParseRecommendation' });
                    try {
                        const dataToSave = scrapedData.map(item => ({
                            ...item,
                            timestamp: item.timestamp || Date.now()
                        }));

                        if (typeof tableAdapter.addBatch === 'function') {
                            await tableAdapter.addBatch(dataToSave);
                            log(`✅ ${dataToSave.length} записей успешно сохранены в таблицу.`, { module: 'ParseRecommendation' });
                        } else if (typeof tableAdapter.add === 'function') {
                            log(`⚠️ tableAdapter.addBatch не найден, сохраняем по одной записи...`, { module: 'ParseRecommendation', level: 'warn' });
                            let savedCount = 0;
                            for (const item of dataToSave) {
                                try {
                                    await tableAdapter.add(item);
                                    savedCount++;
                                } catch (addItemErr) {
                                    log(`❌ Ошибка сохранения одной записи: ${addItemErr.message}`, { module: 'ParseRecommendation', level: 'error' });
                                }
                            }
                            log(`✅ ${savedCount}/${dataToSave.length} записей успешно сохранены в таблицу (по одной).`, { module: 'ParseRecommendation' });
                        } else {
                            throw new Error("Адаптер таблицы не поддерживает методы добавления (add/addBatch)");
                        }
                    } catch (saveErr) {
                        log(`❌ Ошибка сохранения данных в таблицу: ${saveErr.message}`, { module: 'ParseRecommendation', level: 'error' });
                    }

                    // --- 5. Выбор следующего видео ---
                    let nextVideoId = null;
                    log(`🤔 Попытка выбора следующего видео...`, { module: 'ParseRecommendation' });

                    // Получаем ID текущего видео (источника)
                    let currentSourceVideoId = 'unknown_source';
                    if (typeof tabId === 'number' && tabId > 0) {
                        try {
                            const tab = await chrome.tabs.get(tabId);
                            const url = new URL(tab.url);
                            currentSourceVideoId = url.searchParams.get('v') || 'unknown_source_from_url';
                        } catch (urlErr) {
                            log(`⚠️ Ошибка получения текущего videoId из URL: ${urlErr.message}`, { module: 'ParseRecommendation', level: 'warn' });
                        }
                    }
                    log(`📍 Текущее видео (источник): ${currentSourceVideoId}`, { module: 'ParseRecommendation' });

                    // Получаем необходимые зависимости из IndexManager
                    // const indexSnapshot = getStateSnapshot();
                    const dependencies = {
                        visitedSourceVideoIds: indexSnapshot.visitedVideoIds,
                        channelVideoCounts: indexSnapshot.channelVideoCounts,
                        channelToVideoIds: indexSnapshot.channelToVideoIds
                    };

                    // Попытка выбора видео с повторами в случае недоступности выбранного
                    let selectionAttempt = 1;
                    const maxSelectionRetries = 5; // Лимит попыток выбора, если видео недоступно
                    let selectionSuccessful = false;

                    while (selectionAttempt <= maxSelectionRetries && !selectionSuccessful) {
                        log(`🔍 Попытка выбора видео ${selectionAttempt}/${maxSelectionRetries}...`, { module: 'ParseRecommendation' });

                        try {
                            const tempNextVideoId = await selectNextVideo(
                                dependencies,
                                currentSourceVideoId,
                                selectionModeInternal,
                                scrapedData,
                                context
                            );

                            if (!tempNextVideoId) {
                                log(`⚠️ selectNextVideo не вернул ID видео.`, { module: 'ParseRecommendation', level: 'warn' });
                                break; // Нет кандидатов, выходим из цикла выбора
                            }

                            // Проверяем, не находится ли выбранное видео в черном списке
                            const unavailableIds = await getUnavailableVideoIds();
                            if (unavailableIds.has(tempNextVideoId)) {
                                log(`⚠️ Выбранное видео ${tempNextVideoId} находится в черном списке. Повторяем выбор.`, { module: 'ParseRecommendation', level: 'warn' });
                                selectionAttempt++;
                                if (selectionAttempt > maxSelectionRetries) {
                                    log(`❌ Достигнут лимит попыток выбора. Не удалось выбрать доступное видео.`, { module: 'ParseRecommendation', level: 'error' });
                                }
                                continue; // Продолжаем цикл выбора
                            }

                            // Если видео доступно, используем его
                            nextVideoId = tempNextVideoId;
                            selectionSuccessful = true;
                            log(`🎉 Выбрано следующее видео для перехода: ${nextVideoId}`, { module: 'ParseRecommendation', level: 'success' });

                        } catch (selectErr) {
                            log(`❌ Ошибка выбора следующего видео: ${selectErr.message}`, { module: 'ParseRecommendation', level: 'error' });
                            break; // Прерываем попытки выбора при ошибке
                        }
                    }

                    if (!nextVideoId) {
                        log(`⚠️ Не удалось выбрать следующее видео после ${maxSelectionRetries} попыток.`, { module: 'ParseRecommendation', level: 'warn' });
                        // Завершаем попытки итерации
                        break; // Выходим из while(attempt...)
                    }

                    // --- 6. Переход на выбранное видео ---
                    log(`🧭 Попытка перехода на выбранное видео: ${nextVideoId}...`, { module: 'ParseRecommendation' });
                    try {
                        await navigateToVideo(context, nextVideoId);
                        log(`✅ Команда на переход на видео ${nextVideoId} отправлена.`, { module: 'ParseRecommendation', level: 'success' });

                        // --- 7. Ожидание загрузки новой страницы ---
                        log(`⏳ Ожидание загрузки новой страницы...`, { module: 'ParseRecommendation' });
                        // --- НОВОЕ: Умное ожидание ---
                        let pageLoaded = false;
                        const maxWaitTime = 5000; // Максимальное время ожидания 15 секунд
                        const checkInterval = 500; // Проверяем каждые 500 мс
                        const maxChecks = maxWaitTime / checkInterval;
                        let checks = 0;

                        while (checks < maxChecks && !pageLoaded) {
                            checks++;
                            log(`⏳ Проверка загрузки страницы ${checks}/${maxChecks}...`, { module: 'ParseRecommendation' });
                            try {
                                // Проверяем наличие ключевых элементов YouTube
                                const checkResult = await chrome.tabs.sendMessage(tabId, {
                                    action: "checkPageLoaded"
                                });

                                if (checkResult && checkResult.status === "success" && checkResult.isLoaded) {
                                    pageLoaded = true;
                                    log(`✅ Новая страница загружена (проверка ${checks}).`, { module: 'ParseRecommendation' });
                                } else {
                                    log(`⏳ Страница еще не загружена (проверка ${checks}).`, { module: 'ParseRecommendation' });
                                }
                            } catch (checkErr) {
                                log(`⚠️ Ошибка проверки загрузки страницы (проверка ${checks}): ${checkErr.message}`, { module: 'ParseRecommendation', level: 'warn' });
                                // Продолжаем ожидание даже при ошибке проверки
                            }

                            if (!pageLoaded && checks < maxChecks) {
                                await new Promise(resolve => setTimeout(resolve, checkInterval));
                            }
                        }

                        if (!pageLoaded) {
                            log(`⚠️ Страница не загрузилась за ${maxWaitTime}мс. Продолжаем сценарий.`, { module: 'ParseRecommendation', level: 'warn' });
                        }
                        // --- Конец умного ожидания ---

                        iterationCompletedWithTransition = true; // Итерация завершена успешно с переходом
                        successfulTransitions++; // Увеличиваем счетчик успешных переходов
                        noTransitionStreak = 0; // Сбрасываем счетчик "бездействия"

                    } catch (navErr) {
                        log(`❌ Ошибка перехода на видео ${nextVideoId}: ${navErr.message}`, { module: 'ParseRecommendation', level: 'error' });
                        // Переход не удался, пробуем снова (следующая попытка)
                    }

                } catch (iterationErr) {
                    log(`❌ Ошибка в итерации ${currentIterationNumber} (попытка ${attempt}): ${iterationErr.message}`, { module: 'ParseRecommendation', level: 'error' });
                    console.error("[ParseRecommendation] Stack trace ошибки итерации:", iterationErr);

                    if (attempt < maxRetriesPerIteration) {
                        log(`🔁 Попытка ${attempt} не удалась. Перезагрузка страницы и повтор...`, { module: 'ParseRecommendation', level: 'warn' });
                        try {
                            if (typeof tabId === 'number' && tabId > 0) {
                                await chrome.tabs.reload(tabId);
                                log(`🔄 Страница перезагружена. Ожидание загрузки...`, { module: 'ParseRecommendation', level: 'info' });
                                // Пауза после перезагрузки
                                await new Promise(resolve => setTimeout(resolve, 3000));
                            }
                        } catch (reloadErr) {
                            log(`❌ Ошибка перезагрузки страницы: ${reloadErr.message}`, { module: 'ParseRecommendation', level: 'error' });
                        }
                    } else {
                        log(`❌ Все ${maxRetriesPerIteration} попытки итерации ${currentIterationNumber} не удались.`, { module: 'ParseRecommendation', level: 'error' });
                    }
                    attempt++;
                }
            } // Конец цикла попыток для логической итерации

            if (!iterationCompletedWithTransition) {
                log(`❌ Итерация ${currentIterationNumber} не завершена успешно после ${maxRetriesPerIteration} попыток или из-за отсутствия данных.`, { module: 'ParseRecommendation', level: 'error' });
                noTransitionStreak++; // Увеличиваем счетчик неудач
                if (noTransitionStreak >= maxNoTransitionStreak) {
                    log(`⛔ Достигнут лимит (${maxNoTransitionStreak}) итераций без перехода. Завершение сценария.`, { module: 'ParseRecommendation', level: 'error' });
                    throw new Error(`Достигнут лимит итераций без перехода (${maxNoTransitionStreak}).`);
                }
                // Если не достигли лимита, переходим к следующей логической итерации
            } else {
                log(`✅ === ИТЕРАЦИЯ ${currentIterationNumber} ЗАВЕРШЕНА С ПЕРЕХОДОМ ===`, { module: 'ParseRecommendation', level: 'success' });
            }

        } // Конец основного цикла итераций

        log(`🎉 Сценарий "Парсинг рекомендаций" завершён. Выполнено переходов: ${successfulTransitions}/${totalRequestedIterations}.`, { module: 'ParseRecommendation', level: 'success' });
    }
};