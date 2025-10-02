// content/modules/search-parser.js

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
    if (isAlreadyHighlightedOrHasHighlightedParent(el)) {
        return;
    }
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
        boxShadow: '0 0 8px rgba(255, 77, 77, 0.6)',
        boxSizing: 'border-box'
    });
    const computedStyle = window.getComputedStyle(el);
    if (!computedStyle.position || computedStyle.position === 'static') {
        el.style.position = 'relative';
    }
    el.style.overflow = 'visible';
    el.appendChild(box);
    el.classList.add('video-highlighted');
}

/**
 * Фильтрует карточки, оставляя только видео.
 * Исключает каналы, настоящие плейлисты, shorts, стримы и рекламу.
 * @param {HTMLElement} card
 * @returns {boolean}
 */
function isVideoCard(card) {
    // 1. Исключаем Shorts
    if (card.querySelector('a[href*="/shorts/"]') || card.closest('[is-shorts]')) {
        return false;
    }

    // 2. Исключаем Live
    if (card.querySelector('[aria-label*="LIVE" i]')) {
        return false;
    }

    // 3. Исключаем плейлисты (наличие коллекции)
    if (card.querySelector('yt-collection-thumbnail-view-model, [title*="Mix" i]')) {
        return false;
    }

    // 4. Исключаем каналы (ищем признаки канала)
    if (card.querySelector('ytd-channel-renderer, [href*="/channel/"], [href*="/c/"], [href*="/user/"]')) {
        return false;
    }

    // 5. Проверяем, что есть ссылка на /watch?v= (а не на /channel и т.п.)
    const watchLink = card.querySelector('a[href*="/watch?v="]');
    if (!watchLink) {
        return false;
    }

    // 6. Исключаем плейлисты типа PL...
    try {
        const url = new URL(watchLink.href, 'https://www.youtube.com');
        const listParam = url.searchParams.get('list');
        if (listParam && listParam.startsWith('PL')) {
            return false;
        }
    } catch (e) {
        console.warn("[SearchParser] Ошибка разбора URL:", e);
    }

    return true;
}

/**
 * Находит и подсвечивает карточки видео в поисковой выдаче YouTube.
 * @returns {HTMLElement[]} массив DOM-элементов карточек видео
 */
function parseAndHighlightSearchResults() {
    console.log("[SearchParser] === НАЧАЛО ПАРСИНГА ПОИСКОВОЙ ВЫДАЧИ ===");

    // 1. Находим ВСЕ элементы, содержащие ссылку на /watch?v=
    // Ищем ссылки, затем поднимаемся к ближайшему контейнеру карточки
    const videoLinks = Array.from(document.querySelectorAll('a[href*="/watch?v="]'));
    console.log(`[SearchParser] Найдено ссылок на видео: ${videoLinks.length}`);

    // Удаляем дубликаты (например, из метаданных или подсказок)
    const uniqueCards = new Set();
    const cardElements = [];

    for (const link of videoLinks) {
        // Ищем ближайший родительский элемент, который выглядит как карточка
        let card = link.closest('ytd-video-renderer, ytd-item-section-renderer > *, [id^="video-title"], .yt-lockup-view-model, ytd-rich-item-renderer');
        if (!card) {
            // Fallback: используем ближайший div или section с определёнными признаками
            card = link.closest('div, section');
        }
        if (card && !uniqueCards.has(card)) {
            uniqueCards.add(card);
            cardElements.push(card);
        }
    }

    console.log(`[SearchParser] Уникальных карточек до фильтрации: ${cardElements.length}`);

    // 2. Фильтруем по isVideoCard
    const rejectedCards = [];
    const videoCards = cardElements.filter(card => {
        const isVideo = isVideoCard(card);
        if (!isVideo) {
            const titleEl = card.querySelector('#video-title, h3 a, yt-formatted-string[role="text"]');
            const title = titleEl?.textContent?.trim() || 'Без названия';
            rejectedCards.push({ title, href: link?.href || 'нет ссылки' });
        }
        return isVideo;
    });

    console.log(`[SearchParser] Отфильтровано видео: ${videoCards.length}`);
    if (rejectedCards.length > 0) {
        console.group(`[SearchParser] 🚫 Отклонено ${rejectedCards.length} карточек:`);
        rejectedCards.slice(0, 10).forEach((rc, i) => {
            console.log(`${i + 1}. "${rc.title}" — ${rc.href}`);
        });
        console.groupEnd();
    }

    // 3. Подсвечиваем
    videoCards.forEach(highlightElement);
    console.log(`[SearchParser] Подсвечено видео: ${videoCards.length}`);
    console.log("[SearchParser] === КОНЕЦ ПАРСИНГА ===");

    return videoCards;
}

/**
 * Удаляет подсветку, добавленную parseAndHighlightSearchResults.
 */
function removeSearchHighlights() {
    const highlightedCards = document.querySelectorAll('.video-highlighted');
    let removedCount = 0;
    highlightedCards.forEach(card => {
        const highlightBoxes = card.querySelectorAll('div[style*="border: 3px solid"]');
        highlightBoxes.forEach(box => {
            box.remove();
            removedCount++;
        });
        card.classList.remove('video-highlighted');
    });
    console.log(`[SearchParser] Удалено ${removedCount} элементов подсветки.`);
}

/**
 * Извлекает данные из массива DOM-элементов карточек поисковой выдачи.
 * @param {HTMLElement[]} cardElements - массив DOM-элементов карточек.
 * @param {string} searchQuery - Поисковый запрос (например, "пока").
 * @returns {Array<Object>} массив объектов с данными.
 */
function scrapeSearchResults(cardElements, searchQuery = 'unknown_search') {
    console.log(`[SearchParser] Скрапинг ${cardElements.length} карточек...`);
    const scrapedData = [];
    cardElements.forEach((el, index) => {
        try {
            const titleElement = el.querySelector('#video-title');
            const title = titleElement?.textContent?.trim() || 'Без названия';

            let videoId = 'Не найден';
            const linkElement = el.querySelector('a[href*="/watch?v="]');
            if (linkElement) {
                try {
                    const url = new URL(linkElement.href, window.location.origin);
                    videoId = url.searchParams.get('v') || 'Не найден';
                } catch (e) {
                    console.warn(`[SearchParser] Ошибка парсинга URL для карточки ${index}:`, e);
                }
            }

            let views = 'Неизвестно';
            const viewsElement = el.querySelector('.inline-metadata-item');
            if (viewsElement) {
                views = viewsElement.textContent.trim();
            }

            let channelName = 'Неизвестен';
            const channelElement = el.querySelector('#channel-name a, ytd-channel-name a');
            if (channelElement) {
                channelName = channelElement.textContent.trim();
            }

            let thumbnailUrl = '';
            const thumbnailImg = el.querySelector('yt-image img');
            if (thumbnailImg && thumbnailImg.src) {
                thumbnailUrl = thumbnailImg.src;
            }

            scrapedData.push({
                title,
                videoId,
                views,
                channelName,
                sourceVideoId: searchQuery,
                thumbnailUrl
            });
        } catch (err) {
            console.error(`[SearchParser] Ошибка при скрапинге карточки ${index}:`, err);
            scrapedData.push({
                title: `Ошибка скрапинга ${index}`,
                videoId: '',
                views: '',
                channelName: '',
                sourceVideoId: searchQuery,
                thumbnailUrl: ''
            });
        }
    });
    console.log(`[SearchParser] Скрапинг завершён. Извлечено данных: ${scrapedData.length}`);
    return scrapedData;
}

// Экспортируем в глобальную область для использования в content.js
window.ytSearchParser = {
    parseAndHighlight: parseAndHighlightSearchResults,
    removeHighlights: removeSearchHighlights,
    scrapeCards: scrapeSearchResults
};

console.log("[Content Module SearchParser] Модуль загружен и готов.");