// core/utils/scroller.js

/**
 * Прокручивает страницу YouTube N раз с задержкой.
 * @param {Object} context - Контекст сценария для логирования.
 * @param {number} [count=16] - Сколько раз скроллить.
 * @param {number} [delayMs=1500] - Задержка между скроллами (мс).
 * @param {number} [step=1000] - На сколько пикселей скроллить за раз.
 * @returns {Promise<void>}
 */
export async function scrollPageNTimes(context, count = 16, delayMs = 1500, step = 1000) {
    const { log } = context;
    log(`🔄 Начинаем скроллинг страницы: ${count} раз(а), шаг ${step}px, задержка ${delayMs}мс`, { module: 'Scroller' });

    try {
        // Отправляем сообщение в content script для выполнения скроллинга
        // Передаем параметры и функцию для обработки прогресса
        const response = await chrome.tabs.sendMessage(context.tabId, {
            action: "scrollNTimes",
            count: count,
            delayMs: delayMs,
            step: step
        });

        if (response && response.status === "success") {
            log(`✅ Скроллинг завершён. Обработано примерно ${response.cardCount} карточек.`, { module: 'Scroller' });
        } else {
            const errorMsg = response?.message || "Неизвестная ошибка скроллинга";
            log(`❌ Ошибка скроллинга: ${errorMsg}`, { module: 'Scroller', level: 'error' });
            throw new Error(errorMsg);
        }
    } catch (err) {
        log(`❌ Ошибка при взаимодействии со страницей для скроллинга: ${err.message}`, { module: 'Scroller', level: 'error' });
        throw err;
    }
}
