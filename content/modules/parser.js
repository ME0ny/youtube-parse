// content/modules/parser.js

/**
 * Возвращает все карточки видео, исключая плейлисты и коллекции.
 * Использует селекторы из старой, проверенной версии.
 * @returns {HTMLElement[]}
 */
function getVideoCards() {
    console.log("[Content Module Parser] Поиск карточек видео...");
    // Используем селектор из старого рабочего кода
    const allPotentialCards = Array.from(document.querySelectorAll('.yt-lockup-view-model'));
    console.log(`[Content Module Parser] Найдено потенциальных карточек до фильтрации: ${allPotentialCards.length}`);

    const filteredCards = allPotentialCards.filter(el => {
        // Фильтруем по тем же критериям
        const isCollectionStack2 = el.classList.contains('yt-lockup-view-model--collection-stack-2');
        const isCollection = el.classList.contains('yt-lockup-view-model--collection');
        const hasCollectionThumbnail = !!el.querySelector('yt-collection-thumbnail-view-model');
        const hasCollectionsStack = !!el.querySelector('yt-collections-stack');
        const isPlaylist = el.querySelector('a[href*="/watch"]')?.href.includes('list=');

        const shouldBeExcluded = isCollectionStack2 || isCollection || hasCollectionThumbnail || hasCollectionsStack || isPlaylist;

        // Для отладки, выведем информацию о том, что именно фильтруется
        // if (shouldBeExcluded) {
        //     console.log("[Content Module Parser] Исключена карточка:", { isCollectionStack2, isCollection, hasCollectionThumbnail, hasCollectionsStack, isPlaylist });
        // }

        return !shouldBeExcluded;
    });

    console.log(`[Content Module Parser] Найдено карточек видео после фильтрации: ${filteredCards.length}`);
    return filteredCards;
}

/**
 * Проверяет, подсвечена ли карточка или её родитель.
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
 * Добавляет визуальную подсветку к элементу.
 * @param {HTMLElement} el
 */
function highlightElement(el) {
    // Проверка, не подсвечен ли уже элемент или его родитель
    if (isAlreadyHighlightedOrHasHighlightedParent(el)) {
        console.log("[Content Module Parser] Элемент уже подсвечен или находится внутри подсвеченного родителя, пропускаем.");
        return;
    }

    const box = document.createElement('div');
    Object.assign(box.style, {
        position: 'absolute',
        border: '3px solid #ff4d4d', // Используем тот же стиль, что и раньше
        pointerEvents: 'none',
        zIndex: '999999',
        borderRadius: '8px',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        boxShadow: '0 0 8px rgba(255, 77, 77, 0.6)',
        boxSizing: 'border-box' // Добавляем для корректного размера рамки
    });

    // Убедиться, что контейнер имеет position для Absolute потомка
    const computedStyle = window.getComputedStyle(el);
    if (!computedStyle.position || computedStyle.position === 'static') {
        el.style.position = 'relative';
    }
    el.style.overflow = 'visible'; // Чтобы подсветка не обрезалась

    el.appendChild(box);
    el.classList.add('video-highlighted'); // Используем тот же класс
    console.log("[Content Module Parser] Элемент подсвечен.");
}

/**
 * Подсвечивает переданные карточки.
 * @param {HTMLElement[]} cards
 */
function highlightVideoCards(cards) {
    console.log(`[Content Module Parser] Начинаем подсвечивать ${cards.length} карточек...`);
    let highlightedCount = 0;
    cards.forEach(el => {
        try {
            highlightElement(el);
            highlightedCount++;
        } catch (err) {
            console.warn("[Content Module Parser] Ошибка при подсветке элемента:", err);
            // Не прерываем весь процесс из-за одной ошибки
        }
    });
    console.log(`[Content Module Parser] Успешно подсвечено карточек: ${highlightedCount}`);
}

/**
 * Находит и подсвечивает карточки видео на странице YouTube.
 * Возвращает массив найденных DOM-элементов, как требует логика.
 * @returns {HTMLElement[]} массив DOM-элементов карточек
 */
function parseAndHighlightVideoCards() {
    console.log("[Content Module Parser] === Начинаем парсинг и подсветку видео ===");

    // 1. Найти все подходящие карточки
    const cards = getVideoCards();
    console.log(`[Content Module Parser] Найдено карточек для подсветки: ${cards.length}`);

    // Для отладки: выведем первые несколько элементов
    console.log("[Content Module Parser] Первые 3 найденных элемента:", cards.slice(0, 3));

    // 2. Подсветить их
    highlightVideoCards(cards);

    console.log(`[Content Module Parser] === Парсинг и подсветка завершены. Возвращено элементов: ${cards.length} ===`);
    // 3. Вернуть массив найденных и подсвеченных элементов
    return cards;
}

/**
 * Удаляет подсветку, добавленную parseAndHighlightVideoCards.
 */
function removeParserHighlights() {
    console.log("[Content Module Parser] Удаление подсветки...");
    const highlightedCards = document.querySelectorAll('.video-highlighted');
    let removedCount = 0;
    highlightedCards.forEach(card => {
        // Удаляем только наш элемент подсветки (рамку)
        // Ищем div с характерными стилями
        const highlightBoxes = card.querySelectorAll('div[style*="border: 3px solid"]');
        highlightBoxes.forEach(box => {
            box.remove();
            removedCount++;
        });
        card.classList.remove('video-highlighted');
    });
    console.log(`[Content Module Parser] Удалено ${removedCount} элементов подсветки из ${highlightedCards.length} подсвеченных карточек.`);
}

// Экспортируем функции в глобальную область видимости
window.ytParser = {
    parseAndHighlight: parseAndHighlightVideoCards,
    removeHighlights: removeParserHighlights,
    // Для отладки можно экспортировать и вспомогательные функции
    getVideoCards: getVideoCards
};

console.log("[Content Module Parser] Модуль загружен и готов.");