// content/modules/video-checker.js

/**
 * Проверяет, доступно ли текущее видео на странице YouTube.
 * Выполняется в контексте content script.
 * @returns {Promise<boolean>} true, если видео доступно, false - если недоступно или не на странице видео.
 */
function isCurrentVideoAvailable() {
    console.log("[Content Module VideoChecker] Начало проверки доступности видео.");

    try {
        // 1. Проверяем URL - часто недоступные видео имеют специальный URL
        if (window.location.pathname === '/unavailable') {
            console.log("[Content Module VideoChecker] Обнаружен URL /unavailable.");
            return false;
        }

        // 2. Ищем основной элемент плеера или контейнер видео
        const playerElement = document.querySelector('#player, ytd-watch-flexy');
        if (!playerElement) {
            console.log("[Content Module VideoChecker] Не найден основной элемент плеера или watch-flexy.");
            // Это может быть не страница видео, но мы проверяем дальше
        }

        // 3. Ищем специфичный элемент-индикатор недоступности
        // На основе предоставленного HTML
        const promoRenderer = document.querySelector('ytd-background-promo-renderer');
        if (promoRenderer) {
            const titleElement = promoRenderer.querySelector('.promo-title');
            const titleText = titleElement?.textContent?.trim().toLowerCase() || '';

            const bodyTextElement = promoRenderer.querySelector('.promo-body-text');
            const bodyText = bodyTextElement?.textContent?.trim().toLowerCase() || '';

            // Список известных фраз недоступности
            const unavailableIndicators = [
                'video unavailable',
                'this video is private',
                'this video is unavailable',
                'this video has been removed',
                'video заблокирован',
                'видео удалено',
                'видео недоступно'
                // Можно добавить больше на других языках
            ];

            const isUnavailableTitle = unavailableIndicators.some(phrase => titleText.includes(phrase.toLowerCase()));
            const isUnavailableBody = unavailableIndicators.some(phrase => bodyText.includes(phrase.toLowerCase()));

            if (isUnavailableTitle || isUnavailableBody) {
                console.log(`[Content Module VideoChecker] Найдена плашка недоступности. Заголовок: '${titleText}', Тело: '${bodyText}'`);
                return false;
            }
        }

        // 4. Проверяем наличие сообщений об ограничениях (например, возрастные ограничения)
        // Это более сложная проверка, оставим на потом или если потребуется

        // 5. Если не найдены явные признаки недоступности, считаем видео доступным
        // (или на другой странице, но это не ошибка "недоступности")
        console.log("[Content Module VideoChecker] Признаки недоступности видео не найдены. Считаем доступным.");
        return true;

    } catch (err) {
        console.error("[Content Module VideoChecker] Ошибка при проверке доступности видео:", err);
        // В случае ошибки проверки, лучше считать видео доступным, чтобы не блокировать работу
        return true;
    }
}

// Экспортируем функцию в глобальную область видимости для вызова из content.js
window.ytVideoChecker = {
    isCurrentVideoAvailable: isCurrentVideoAvailable
};

console.log("[Content Module VideoChecker] Модуль загружен и готов.");