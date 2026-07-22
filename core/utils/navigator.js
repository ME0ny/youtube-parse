// core/utils/navigator.js

/**
 * Переходит на страницу поиска YouTube по заданному запросу.
 * Использует chrome.tabs.update для 100% надежности в Manifest V3.
 * @param {Object} context - Контекст сценария (для tabId и логов).
 * @param {string} query - Поисковый запрос.
 * @returns {Promise<void>}
 */
export async function navigateToSearchQuery(context, query) {
    const { log, tabId } = context;

    if (typeof tabId !== 'number' || tabId < 0) {
        const errorMsg = `Недействительный tabId для перехода к поиску: ${tabId}`;
        log(`❌ ${errorMsg}`, { module: 'Navigator', level: 'error' });
        throw new Error(errorMsg);
        // Примечание: Если tabId null, сценарий должен прерваться, так как парсить негде
    }

    if (!query || typeof query !== 'string') {
        throw new Error(`Недействительный поисковый запрос: ${query}`);
    }

    const encodedQuery = encodeURIComponent(query.trim());
    const targetUrl = `https://www.youtube.com/results?search_query=${encodedQuery}`;

    log(`🧭 Переход к поиску через chrome.tabs.update: "${query}"`, { module: 'Navigator' });

    try {
        // ✅ НАДЕЖНЫЙ СПОСОБ: Инициируем переход на уровне браузера.
        // Это исключает ошибку "Receiving end does not exist", так как 
        // content script не участвует в самом факте навигации.
        await chrome.tabs.update(tabId, { url: targetUrl });

        // Ждем 3 секунды для первоначальной загрузки DOM YouTube (как в алгоритме)
        log('⏳ Ожидание первичной загрузки страницы (3 сек)...', { module: 'Navigator' });
        await new Promise(resolve => setTimeout(resolve, 3000));

        log(`✅ Страница поиска успешно загружена`, { module: 'Navigator', level: 'success' });
    } catch (err) {
        log(`❌ Критическая ошибка перехода: ${err.message}`, { module: 'Navigator', level: 'error' });
        throw err; // Пробрасываем, чтобы сценарий мог освободить задачу
    }
}

/**
 * Переходит на страницу YouTube видео по его ID.
 * @param {Object} context - Контекст сценария (для tabId и логов).
 * @param {string} videoId - ID видео.
 * @returns {Promise<void>}
 */
export async function navigateToVideo(context, videoId) {
    const { log, tabId } = context;

    if (typeof tabId !== 'number' || tabId < 0) {
        throw new Error(`Недействительный tabId для навигации: ${tabId}`);
    }
    if (!videoId || typeof videoId !== 'string') {
        throw new Error(`Недействительный videoId: ${videoId}`);
    }

    const targetUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
    log(`🧭 Переход к видео через chrome.tabs.update: ${videoId}`, { module: 'Navigator' });

    try {
        await chrome.tabs.update(tabId, { url: targetUrl });

        log('⏳ Ожидание загрузки страницы видео (3 сек)...', { module: 'Navigator' });
        await new Promise(resolve => setTimeout(resolve, 3000));

        log(`✅ Страница видео успешно загружена`, { module: 'Navigator', level: 'success' });
    } catch (err) {
        log(`❌ Критическая ошибка перехода к видео: ${err.message}`, { module: 'Navigator', level: 'error' });
        throw err;
    }
}