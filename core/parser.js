// core/parser.js

/**
 * Находит и подсвечивает карточки видео на странице YouTube
 * @returns {HTMLElement[]} массив DOM-элементов карточек
 */
function parseAndHighlightVideoCards() {
    const cards = getVideoCards();
    highlightVideoCards(cards);
    console.log(`[Parser] Найдено и подсвечено ${cards.length} видео`);
    return cards;
}

/**
 * Возвращает все карточки видео, исключая плейлисты и коллекции
 * @returns {HTMLElement[]}
 */
function getVideoCards() {
    return Array.from(document.querySelectorAll('.yt-lockup-view-model')).filter(el => {
        return !(
            el.classList.contains('yt-lockup-view-model--collection-stack-2') ||
            el.classList.contains('yt-lockup-view-model--collection') ||
            !!el.querySelector('yt-collection-thumbnail-view-model') ||
            !!el.querySelector('yt-collections-stack') ||
            (el.querySelector('a[href*="/watch"]')?.href.includes('list=PL'))
        );
    });
}

/**
 * Подсвечивает переданные карточки
 * @param {HTMLElement[]} cards
 */
function highlightVideoCards(cards) {
    cards.forEach(el => {
        if (isAlreadyHighlightedOrHasHighlightedParent(el)) return;
        highlightElement(el);
    });
}

/**
 * Проверяет, подсвечена ли карточка или её родитель
 * @param {HTMLElement} el
 * @returns {boolean}
 */
function isAlreadyHighlightedOrHasHighlightedParent(el) {
    if (el.classList.contains('video-highlighted')) return true;
    let parent = el.parentElement;
    while (parent) {
        if (parent.classList?.contains('video-highlighted')) return true;
        parent = parent.parentElement;
    }
    return false;
}

/**
 * Добавляет визуальную подсветку к элементу
 * @param {HTMLElement} el
 */
function highlightElement(el) {
    const box = document.createElement('div');
    Object.assign(box.style, {
        position: 'absolute',
        border: '3px solid #ff4d4d',
        pointerEvents: 'none',
        zIndex: '999999',
        borderRadius: '8px',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        boxShadow: '0 0 8px rgba(255, 77, 77, 0.6)'
    });

    if (getComputedStyle(el).position === 'static') {
        el.style.position = 'relative';
    }
    el.style.overflow = 'visible';
    el.appendChild(box);
    el.classList.add('video-highlighted');
}

// Экспортируем для использования в content.js
window.VideoParser = {
    parseAndHighlight: parseAndHighlightVideoCards,
    getVideoCards, // на случай, если нужно только найти без подсветки
    removeHighlights // добавим ниже
};

/**
 * Удаляет все подсветки
 */
function removeHighlights() {
    document.querySelectorAll('.video-highlighted').forEach(el => {
        const boxes = el.querySelectorAll('div[style*="border: 3px solid"]');
        boxes.forEach(box => box.remove());
        el.classList.remove('video-highlighted');
    });
    console.log("[Parser] Подсветка удалена");
}

// Добавим в экспорт
window.VideoParser.removeHighlights = removeHighlights;