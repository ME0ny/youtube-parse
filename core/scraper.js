// core/scraper.js

/**
 * Извлекает данные из массива DOM-элементов карточек
 * @param {HTMLElement[]} cards - массив карточек
 * @param {string} sourceVideoId - ID текущего видео (источника)
 * @returns {Object[]} массив объектов с данными
 */
// core/scraper.js — обновлённая функция scrapeCards

function scrapeCards(cards, sourceVideoId = 'unknown') {
    return cards.map(el => {
        try {
            // 1. Название видео
            const titleElement = el.querySelector('.yt-lockup-metadata-view-model__title');
            const title = titleElement?.textContent?.trim() || 'Без названия';

            // 2. ID видео из ссылки
            const linkElement = el.querySelector('a[href*="/watch?v="]');
            let videoId = 'Не найден';
            if (linkElement) {
                try {
                    const url = new URL(linkElement.href, window.location.origin);
                    videoId = url.searchParams.get('v') || 'Не найден';
                } catch (e) {
                    console.warn("[Scraper] Ошибка парсинга URL");
                }
            }

            // 3. Количество просмотров
            let views = 'Неизвестно';
            const metadataRows = el.querySelectorAll('.yt-content-metadata-view-model__metadata-row');
            metadataRows.forEach(row => {
                const text = row.textContent || '';
                if (text.includes('views') || text.includes('просмотров') || text.includes('view')) {
                    views = text
                        .split('•')[0]
                        .replace(/\s*views?\s*/i, '')
                        .trim();
                }
            });

            // 4. Название канала
            let channelName = 'Неизвестен';
            const firstMetadataRow = el.querySelector('.yt-content-metadata-view-model__metadata-row');
            if (firstMetadataRow) {
                const firstTextSpan = Array.from(firstMetadataRow.children).find(child =>
                    child.tagName === 'SPAN' && !child.querySelector('.ytIconWrapperHost')
                );
                if (firstTextSpan) {
                    channelName = firstTextSpan.textContent.trim() || 'Неизвестен';
                } else {
                    const fullText = firstMetadataRow.textContent || '';
                    const grayPartIndex = fullText.indexOf(' • ');
                    if (grayPartIndex > -1) {
                        channelName = fullText.substring(0, grayPartIndex).trim();
                    } else {
                        channelName = fullText.trim();
                    }
                }
            }

            // 5. 👇 НОВОЕ: Thumbnail URL
            let thumbnailUrl = '';
            const thumbnailImg = el.querySelector('yt-thumbnail-view-model img');
            if (thumbnailImg) {
                thumbnailUrl = thumbnailImg.src || '';
            }

            return {
                title,
                videoId,
                views,
                channelName,
                sourceVideoId,
                thumbnailUrl // 👈 НОВОЕ ПОЛЕ
            };
        } catch (err) {
            console.warn('[Scraper] Ошибка при парсинге карточки:', err);
            return {
                title: 'Ошибка',
                videoId: '',
                views: '',
                channelName: '',
                sourceVideoId,
                thumbnailUrl: ''
            };
        }
    });
}

// Экспортируем
window.VideoScraper = {
    scrape: scrapeCards
};