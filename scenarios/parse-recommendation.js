
// scenarios/parse-recommendation.js
import { scrollPageNTimes } from '../core/utils/scroller.js';
import { parseAndHighlight, removeParserHighlights } from '../core/utils/parser.js';
import { addScrapedData as updateIndexManager } from '../core/index-manager.js';
import { logger } from '../background/background.js'; // Убедись, что logger доступен
import { tableAdapter } from '../background/background.js'; // 👈 НОВОЕ: Импорт tableAdapter
import { getUnavailableVideoIds, addUnavailableVideoIds } from '../core/utils/blacklist.js';
import { selectNextVideo } from '../core/utils/video-selector.js';
import { getStateSnapshot } from '../core/index-manager.js';
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

        const selectionMode = params.mode || 'all_videos'; // По умолчанию 'all_videos'
        const internalSelectionMode = selectionMode;

        log(`🚀 Сценарий "Парсинг рекомендаций" запущен.`, { module: 'ParseRecommendation' });
        log(`🔧 Параметры скроллинга: ${JSON.stringify(scrollParams)}`, { module: 'ParseRecommendation' });
        log(`🧠 Алгоритм выбора следующего видео: ${internalSelectionMode}`, { module: 'ParseRecommendation' }); // 👈 НОВОЕ

        try {
            // Проверяем, не было ли запроса на остановку до начала
            log(`⏳ Проверка abortSignal перед скроллингом...`, { module: 'ParseRecommendation' });
            await abortSignal();
            log(`✅ Проверка abortSignal пройдена.`, { module: 'ParseRecommendation' });

            // --- 0. НОВОЕ: Проверка доступности текущего видео ---
            log(`🔒 Проверка доступности текущего видео...`, { module: 'ParseRecommendation' });
            try {
                // Получаем URL текущей вкладки
                if (typeof tabId !== 'number' || tabId < 0) {
                    throw new Error(`Недействительный tabId: ${tabId}`);
                }
                const tab = await chrome.tabs.get(tabId);
                const currentUrl = tab.url;
                log(`🔒 Текущий URL: ${currentUrl}`, { module: 'ParseRecommendation' });

                // Извлекаем videoId из URL
                let currentVideoId = null;
                try {
                    const url = new URL(currentUrl);
                    if (url.hostname.includes('youtube.com') && url.pathname === '/watch') {
                        currentVideoId = url.searchParams.get('v');
                    }
                } catch (urlErr) {
                    console.warn("[ParseRecommendation] Ошибка разбора URL:", urlErr);
                }

                if (!currentVideoId) {
                    log(`⚠️ Не удалось извлечь videoId из URL. Пропускаем проверку доступности.`, { module: 'ParseRecommendation', level: 'warn' });
                    // Продолжаем выполнение
                } else {
                    log(`🔒 Проверяем доступность видео ID: ${currentVideoId}...`, { module: 'ParseRecommendation' });

                    // Отправляем сообщение content script для проверки
                    const checkResponse = await chrome.tabs.sendMessage(tabId, {
                        action: "checkVideoAvailability"
                    });

                    if (checkResponse && checkResponse.status === "success") {
                        const isAvailable = checkResponse.isAvailable;
                        log(`🔒 Результат проверки для ${currentVideoId}: ${isAvailable ? 'Доступно' : 'Недоступно'}`, { module: 'ParseRecommendation', level: isAvailable ? 'info' : 'warn' });

                        if (!isAvailable) {
                            // Видео недоступно - добавляем в черный список
                            log(`🔒 Видео ${currentVideoId} недоступно. Добавляем в черный список.`, { module: 'ParseRecommendation', level: 'error' });
                            await addUnavailableVideoIds(currentVideoId);
                            log(`🔒 Видео ${currentVideoId} добавлено в черный список недоступных.`, { module: 'ParseRecommendation', level: 'warn' });

                            // Здесь можно решить, прерывать ли сценарий или продолжать
                            // Для MVP: прерываем сценарий
                            log(`⏹️ Сценарий остановлен из-за недоступности текущего видео (${currentVideoId}).`, { module: 'ParseRecommendation', level: 'error' });
                            throw new Error(`Текущее видео (${currentVideoId}) недоступно. Добавлено в черный список.`);

                            // Альтернатива: продолжить, но залогировать ошибку
                            // log(`⚠️ Текущее видео недоступно, но сценарий продолжится.`, { module: 'ParseRecommendation', level: 'warn' });
                        } else {
                            log(`✅ Текущее видео доступно. Продолжаем выполнение.`, { module: 'ParseRecommendation' });
                        }
                    } else {
                        const checkErrorMsg = checkResponse?.message || "Неизвестная ошибка проверки";
                        log(`⚠️ Ошибка проверки доступности: ${checkErrorMsg}`, { module: 'ParseRecommendation', level: 'warn' });
                        // Продолжаем выполнение, несмотря на ошибку проверки
                    }
                }
            } catch (checkErr) {
                log(`⚠️ Ошибка связи при проверке доступности: ${checkErr.message}`, { module: 'ParseRecommendation', level: 'warn' });
                // Продолжаем выполнение, несмотря на ошибку связи
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

            // --- 5. Выбор следующего видео
            if (scrapedData.length > 0) {
                log(`🤔 Попытка выбора следующего видео...`, { module: 'ParseRecommendation' });
                try {
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

                    // 👇 НОВОЕ: Получаем необходимые зависимости из IndexManager
                    const indexSnapshot = getStateSnapshot(); // Получаем копию состояния
                    const dependencies = {
                        visitedSourceVideoIds: indexSnapshot.visitedVideoIds, // Это Set<sourceVideoId>
                        channelVideoCounts: indexSnapshot.channelVideoCounts, // Это Map<channel, count>
                        channelToVideoIds: indexSnapshot.channelToVideoIds // Это Map<channel, Set<videoId>>
                    };

                    // 👇 НОВОЕ: Получаем режим выбора из параметров сценария
                    // Убедитесь, что params.mode содержит 'current_recommendations' или 'all_videos'
                    // Если в UI у вас другие значения, их нужно преобразовать
                    const selectionModeInternal = params.mode || 'all_videos'; // Дефолтный режим

                    // 👇 ИСПРАВЛЕННЫЙ ВЫЗОВ selectNextVideo
                    const nextVideoId = await selectNextVideo(
                        dependencies,              // 1. Объект с зависимостями
                        currentSourceVideoId,      // 2. ID текущего видео (источника)
                        selectionModeInternal,     // 3. Режим выбора
                        scrapedData,               // 4. Данные для 'current_recommendations'
                        context                    // 5. Контекст для логирования (log)
                    );

                    if (nextVideoId) {
                        log(`🎉 Выбрано следующее видео для перехода: ${nextVideoId}`, { module: 'ParseRecommendation', level: 'success' });
                        // TODO: Здесь будет логика перехода на nextVideoId в следующем шаге
                    } else {
                        log(`⚠️ Не удалось выбрать следующее видео.`, { module: 'ParseRecommendation', level: 'warn' });
                    }
                } catch (selectErr) {
                    log(`❌ Ошибка выбора следующего видео: ${selectErr.message}`, { module: 'ParseRecommendation', level: 'error' });
                    console.error("[ParseRecommendation] Stack trace ошибки выбора:", selectErr); // Для отладки
                }
            } else {
                log(`ℹ️ Нет данных для выбора следующего видео.`, { module: 'ParseRecommendation' });
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
