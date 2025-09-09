// content/scroller.js

/**
 * Прокручивает страницу N раз с задержкой
 * @param {number} count - сколько раз скроллить
 * @param {number} delayMs - задержка между скроллами
 * @param {number} step - на сколько пикселей скроллить за раз
 * @param {Function} onProgress - callback для обновления прогресса
 * @returns {Promise<void>}
 */
function scrollNTimes(count = 16, delayMs = 1500, step = 1000, onProgress = null) {
    return new Promise((resolve) => {
        let current = 0;

        function nextScroll() {
            if (current >= count) {
                if (onProgress) onProgress({ done: true, total: count, current });
                resolve();
                return;
            }

            current++;
            window.scrollBy(0, step);

            if (onProgress) {
                onProgress({
                    done: false,
                    total: count,
                    current,
                    message: `⏳ Скролл ${current}/${count}...`
                });
            }

            setTimeout(nextScroll, delayMs);
        }

        if (onProgress) {
            onProgress({ done: false, total: count, current: 0, message: "🚀 Начинаем скроллинг..." });
        }

        nextScroll();
    });
}

// Экспортируем в глобальный объект для доступа из content.js
window.VideoScroller = {
    scrollNTimes
};