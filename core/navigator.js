// core/navigator.js

/**
 * Переходит на страницу видео YouTube по его ID
 * @param {string} videoId - ID видео
 * @returns {boolean} true если переход инициирован, false если ошибка
 */
function navigateToVideo(videoId) {
    if (!videoId || videoId === 'unknown' || videoId === 'Не найден') {
        console.warn("[Navigator] Некорректный videoId:", videoId);
        return false;
    }

    const url = `https://www.youtube.com/watch?v=${videoId}`;
    console.log(`[Navigator] Переход на: ${url}`);

    // Переходим в текущей вкладке
    window.location.href = url;
    return true;
}

// Экспортируем
window.VideoNavigator = {
    navigate: navigateToVideo
};