// core/utils/scroller.js

/**
 * Выполняет один акт скроллинга страницы.
 * @param {Object} options - Опции для скролла.
 * @param {number} [options.step=1000] - На сколько пикселей скроллить за раз.
 * @returns {void}
 */
function performSingleScroll({ step = 1000 } = {}) {
    window.scrollBy(0, step);
    // Можно добавить логику подсчета карточек здесь, если нужно после каждого скролла,
    // но в текущей логике это делается один раз в конце серии.
    // const estimatedCardCount = document.querySelectorAll('ytd-rich-item-renderer, ytd-compact-video-renderer').length;
    // return { cardCount: estimatedCardCount };
}
window.performSingleScroll = performSingleScroll;