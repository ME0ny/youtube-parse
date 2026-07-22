// scenarios/parse-search-results.js
import { logger, tableAdapter, authManager } from '../background/background.js';
import { navigateToSearchQuery } from '../core/utils/navigator.js';
import { scrollPageNTimes } from '../core/utils/scroller.js';
import { parseAndHighlightSearch } from '../core/utils/search-parser.js';

/**
 * Надёжный парсер строки просмотров в число (локальная версия).
 */
function parseViewsRobust(viewStr) {
    if (!viewStr || typeof viewStr !== 'string') return 0;
    viewStr = viewStr.trim();
    if (viewStr.startsWith('http') || viewStr.includes('ytimg.com')) return 0;

    const unknownValues = ['неизвестно', 'no', '-', '—', '', 'unknown'];
    if (unknownValues.includes(viewStr.toLowerCase())) return 0;

    const patterns = [
        { regex: /([\d\s\u00A0,\.]+)[\s\u00A0]*млрд\.?/i, multiplier: 1_000_000_000 },
        { regex: /([\d\s\u00A0,\.]+)[\s\u00A0]*млн\.?/i, multiplier: 1_000_000 },
        { regex: /([\d\s\u00A0,\.]+)[\s\u00A0]*тыс\.?/i, multiplier: 1_000 },
        { regex: /([\d\s\u00A0,\.]+)[\s\u00A0]*[Bb]/i, multiplier: 1_000_000_000 },
        { regex: /([\d\s\u00A0,\.]+)[\s\u00A0]*[Mm]/i, multiplier: 1_000_000 },
        { regex: /([\d\s\u00A0,\.]+)[\s\u00A0]*[Kk]/i, multiplier: 1_000 },
    ];

    for (const { regex, multiplier } of patterns) {
        const match = viewStr.match(regex);
        if (match) {
            const numStr = match[1].replace(/\s/g, '').replace(',', '.');
            const num = parseFloat(numStr);
            if (!isNaN(num)) return Math.floor(num * multiplier);
        }
    }

    const digitsOnly = viewStr.replace(/[^\d]/g, '');
    return digitsOnly ? parseInt(digitsOnly, 10) : 0;
}

/**
 * @type {import('../core/types/scenario.types.js').ScenarioDefinition}
 */
export const parseSearchResultsScenario = {
    id: 'parse-search-results',
    name: 'Парсинг поисковой выдачи',
    description: 'Прокручивает поисковую выдачу, парсит видео и сохраняет данные по новому алгоритму с дедупликацией и аналитикой.',

    async execute(context) {
        const { log, params = {}, tabId, abortSignal } = context;

        const queryCount = parseInt(params.iterations, 10) || 1;
        let currentTaskId = null;
        let isTaskFinished = false;
        let processedQueries = 0;

        const russianChannelBuffer = [];
        const BUFFER_SIZE = 5;
        let lowPerformanceCounter = 0;

        try {
            // ==========================================
            // 1. Проверка авторизации
            // ==========================================
            const isAuthenticated = await authManager.isAuthenticated();
            if (!isAuthenticated) {
                log('❌ Клиент не авторизован. Пожалуйста, войдите в аккаунт.', { module: 'ParseSearchResults', level: 'error' });
                return;
            }
            const apiClient = authManager.getApiClient();

            // ==========================================
            // 2. Инициализация дедупликации
            // ==========================================
            log('🔄 Загрузка существующих videoId для дедупликации...', { module: 'ParseSearchResults' });
            const allData = await tableAdapter.getAll();
            const existingVideoIds = new Set(allData.map(item => item.videoId).filter(id => id));
            log(`✅ Загружено ${existingVideoIds.size} существующих videoId.`, { module: 'ParseSearchResults' });

            // ==========================================
            // 4. Основной цикл по количеству запросов
            // ==========================================
            while (processedQueries < queryCount) {
                try {
                    // 4.1. Проверка остановки
                    await abortSignal();

                    // 4.2. Получение задачи
                    log(`📥 Запрос следующей задачи (${processedQueries + 1}/${queryCount})...`, { module: 'ParseSearchResults' });
                    const taskResponse = await apiClient.getNextTask();

                    if (!taskResponse) { // 204 No Content
                        log('ℹ️ Задач больше нет (204 No Content). Завершение основного цикла.', { module: 'ParseSearchResults', level: 'warn' });
                        break;
                    }

                    currentTaskId = taskResponse.task_id;
                    const searchQuery = taskResponse.search_query;
                    isTaskFinished = false;

                    log(`✅ Получена задача: "${searchQuery}" (ID: ${currentTaskId})`, { module: 'ParseSearchResults' });

                    // 4.3. Навигация
                    log(`🧭 Переход к поисковому запросу: "${searchQuery}"`, { module: 'ParseSearchResults' });
                    await navigateToSearchQuery(context, searchQuery);

                    // 4.4. Внутренний цикл скроллинга
                    let shouldContinueScrolling = true;

                    while (shouldContinueScrolling) {
                        // 4.4.1. Проверка остановки
                        await abortSignal();

                        // 4.4.2. Скроллинг
                        log('🔄 Выполнение скроллинга...', { module: 'ParseSearchResults' });
                        await scrollPageNTimes(context, 12, 1500, 1000);

                        // 4.4.3. Парсинг
                        const parseResult = await parseAndHighlightSearch(context, searchQuery);
                        const scrapedData = parseResult.scrapedData || [];

                        if (scrapedData.length === 0) {
                            log('⚠️ Выдача пуста. Завершаем задачу.', { module: 'ParseSearchResults', level: 'warn' });
                            await apiClient.completeTask(currentTaskId);
                            isTaskFinished = true;
                            break;
                        }

                        // 4.4.4. Дедупликация
                        const newVideos = scrapedData.filter(v => v.videoId && !existingVideoIds.has(v.videoId));

                        if (newVideos.length === 0) {
                            log('⚠️ Все спарсенные видео уже известны. Завершаем задачу.', { module: 'ParseSearchResults', level: 'warn' });
                            await apiClient.completeTask(currentTaskId);
                            isTaskFinished = true;
                            break;
                        }

                        // 4.4.5. Отправка батча
                        log(`📤 Отправка батча из ${newVideos.length} новых видео...`, { module: 'ParseSearchResults' });
                        const batchVideos = newVideos.map(v => ({
                            videoId: v.videoId,
                            title: v.title,
                            views: v.views,
                            viewsCount: parseViewsRobust(v.views),
                            channelName: v.channelName,
                            channelId: null,
                            thumbnailUrl: v.thumbnailUrl || null
                        }));

                        const batchResponse = await apiClient.submitBatch(
                            currentTaskId,
                            { type: 'search', query: searchQuery },
                            batchVideos,
                            15000
                        );
                        const batchId = batchResponse.batchId;

                        // 4.4.6. Обновление локального кэша
                        newVideos.forEach(v => existingVideoIds.add(v.videoId));

                        // 4.4.7. Получение новизны (Novelty)
                        log(`🔍 Запрос аналитики новизны для батча ${batchId}...`, { module: 'ParseSearchResults' });
                        const noveltyResponse = await apiClient.getBatchNovelty(batchId);
                        const newChannelsCount = noveltyResponse.newChannelsCount;
                        const totalUniqueChannels = noveltyResponse.totalUniqueChannels;

                        // 4.4.8. Логирование и UI
                        log(`🆕 Новых русских каналов: ${newChannelsCount} из ${totalUniqueChannels}`, { module: 'ParseSearchResults', level: 'success' });

                        // ✅ ИСПРАВЛЕНИЕ 2: В UI выводим именно СКОЛЬЗЯЩУЮ СРЕДНЮЮ (currentAverage), 
                        // а не сырое newChannelsCount. Используем format: '1' для отображения 1 знака после запятой.
                        // (Значение будет обновлено чуть ниже, после расчета currentAverage)

                        // 4.4.9. Логика принятия решения
                        russianChannelBuffer.push(newChannelsCount);
                        if (russianChannelBuffer.length > BUFFER_SIZE) {
                            russianChannelBuffer.shift();
                        }

                        const currentAverage = russianChannelBuffer.reduce((a, b) => a + b, 0) / russianChannelBuffer.length;

                        // ✅ ИСПРАВЛЕНИЕ 2 (продолжение): Обновляем метрику в popup скользящей средней
                        logger.updateMetric('russianChannelsInSearch', currentAverage, { format: '1' });

                        log(`📊 Скользящая средняя новых русских каналов: ${currentAverage.toFixed(1)} (буфер: [${russianChannelBuffer.join(', ')}])`, { module: 'ParseSearchResults' });

                        if (currentAverage >= 7) {
                            lowPerformanceCounter = 0;
                            shouldContinueScrolling = true;
                        } else if (currentAverage >= 5) {
                            lowPerformanceCounter++;
                            if (lowPerformanceCounter >= 2) {
                                shouldContinueScrolling = false;
                                log('⚠️ Низкая эффективность (>=2 итерации в диапазоне 5-7). Остановка скроллинга.', { module: 'ParseSearchResults', level: 'warn' });
                            } else {
                                shouldContinueScrolling = true;
                            }
                        } else {
                            shouldContinueScrolling = false;
                            log('🛑 Низкая эффективность (<5). Остановка скроллинга.', { module: 'ParseSearchResults', level: 'warn' });
                        }
                    } // Конец внутреннего цикла (4.4)

                    // 4.5. Завершение задачи
                    if (!isTaskFinished) {
                        log('✅ Завершение текущей задачи...', { module: 'ParseSearchResults' });
                        await apiClient.completeTask(currentTaskId);
                        isTaskFinished = true;
                    }

                    // ✅ ИСПРАВЛЕНИЕ 1: Сброс буфера и счётчика при переходе к следующему поисковому запросу
                    // Это гарантирует, что метрики нового запроса начнутся с чистого листа
                    log('🔄 Сброс буфера метрик и счётчика для следующего поискового запроса...', { module: 'ParseSearchResults' });
                    russianChannelBuffer.length = 0;
                    lowPerformanceCounter = 0;

                    // 4.6. Инкремент
                    processedQueries++;

                } catch (err) {
                    // 4.7. Обработка ошибок
                    if (err.message === 'Сценарий остановлен пользователем.') {
                        throw err;
                    }

                    log(`❌ Критическая ошибка на итерации ${processedQueries + 1}: ${err.message}`, { module: 'ParseSearchResults', level: 'error' });

                    if (currentTaskId && !isTaskFinished) {
                        log('🔄 Попытка освободить задачу из-за ошибки...', { module: 'ParseSearchResults' });
                        try {
                            await apiClient.releaseTask(currentTaskId, 'other', err.message);
                            isTaskFinished = true;
                        } catch (releaseErr) {
                            log(`⚠️ Не удалось освободить задачу: ${releaseErr.message}`, { module: 'ParseSearchResults', level: 'warn' });
                        }
                    }

                    // Если это сетевая ошибка API (status === 0) или вкладка закрыта, прерываем весь сценарий
                    if (err.status === 0 || err.message.includes('Недействительный tabId') || err.message.includes('No tab with id')) {
                        log('🌐 Сетевая ошибка или вкладка закрыта. Прерывание всего сценария.', { module: 'ParseSearchResults', level: 'error' });
                        break;
                    }
                }
            } // Конец основного цикла (4)

            log(`🏁 Сценарий успешно завершен. Обработано запросов: ${processedQueries} из запрошенных ${queryCount}.`, { module: 'ParseSearchResults', level: 'success' });

        } catch (err) {
            // ==========================================
            // 5. Обработка остановки сценария (кнопка "Стоп")
            // ==========================================
            if (err.message === 'Сценарий остановлен пользователем.') {
                log('⏹️ Получен сигнал остановки от пользователя.', { module: 'ParseSearchResults', level: 'warn' });

                if (currentTaskId && !isTaskFinished) {
                    try {
                        log('🔄 Освобождение активной задачи перед выходом...', { module: 'ParseSearchResults' });
                        await apiClient.releaseTask(currentTaskId, 'other', 'Сценарий остановлен пользователем');
                        log('✅ Активная задача освобождена и вернётся в очередь.', { module: 'ParseSearchResults', level: 'success' });
                    } catch (releaseErr) {
                        log(`⚠️ Не удалось освободить задачу при остановке: ${releaseErr.message}`, { module: 'ParseSearchResults', level: 'warn' });
                    }
                }

                log('🛑 Сценарий остановлен пользователем.', { module: 'ParseSearchResults', level: 'warn' });
                return;
            }

            log(`❌ Неожиданная ошибка сценария: ${err.message}`, { module: 'ParseSearchResults', level: 'error' });
            throw err;
        }
    }
};