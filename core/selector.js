// core/selector.js

/**
 * Выбирает следующее видео для парсинга по улучшенному алгоритму:
 * 1. Группирует по каналам
 * 2. Сортирует каналы по возрастанию количества видео
 * 3. Проверяет до 10 каналов с наименьшим количеством
 * 4. Для каждого канала ищет видео, которое:
 *    - не является текущим
 *    - не было исходным
 * 5. Если не нашёл — берёт первое подходящее из таблицы
 */
function selectNextVideoId(videos, currentVideoId = null) {
    if (!videos || videos.length === 0) {
        return null;
    }

    // 1. Группируем видео по каналам
    const channelGroups = {};
    videos.forEach(video => {
        const channel = video.channelName || 'Неизвестен';
        if (!channelGroups[channel]) {
            channelGroups[channel] = [];
        }
        channelGroups[channel].push(video);
    });

    // 2. Сортируем каналы по возрастанию количества видео
    const sortedChannels = Object.entries(channelGroups)
        .sort(([, a], [, b]) => a.length - b.length);

    // 3. Проверяем до 10 каналов с наименьшим количеством
    for (let i = 0; i < Math.min(10, sortedChannels.length); i++) {
        const [channelName, videoList] = sortedChannels[i];

        // Ищем видео, которое:
        // - не текущее
        // - не было исходным
        for (const video of videoList) {
            if (
                video.videoId !== currentVideoId &&
                video.videoId !== video.sourceVideoId
            ) {
                return video.videoId;
            }
        }

        // Если не нашли "идеальное" — ищем просто не текущее
        for (const video of videoList) {
            if (video.videoId !== currentVideoId) {
                return video.videoId;
            }
        }
    }

    // 4. ФИНАЛЬНЫЙ FALLBACK: первое видео из всей таблицы, не равное текущему
    for (const video of videos) {
        if (video.videoId !== currentVideoId) {
            return video.videoId;
        }
    }

    // 5. Абсолютный fallback
    return videos[0]?.videoId || null;
}

function selectNextVideoFromLastBatch(videos, currentVideoId) {
    if (!videos || videos.length === 0 || !currentVideoId) {
        return null;
    }

    // 1. Фильтруем видео, которые были найдены на текущей странице
    const lastBatch = videos.filter(video => video.sourceVideoId === currentVideoId);

    if (lastBatch.length === 0) {
        console.log("[Selector] Нет видео из последней подборки");
        return null;
    }

    console.log(`[Selector] Найдено ${lastBatch.length} видео из последней подборки`);

    // 2. Группируем по каналам
    const channelGroups = {};
    lastBatch.forEach(video => {
        const channel = video.channelName || 'Неизвестен';
        if (!channelGroups[channel]) {
            channelGroups[channel] = [];
        }
        channelGroups[channel].push(video);
    });

    // 3. Сортируем каналы по возрастанию количества
    const sortedChannels = Object.entries(channelGroups)
        .sort(([, a], [, b]) => a.length - b.length);

    // 4. Проверяем до 10 каналов
    for (let i = 0; i < Math.min(10, sortedChannels.length); i++) {
        const [channelName, videoList] = sortedChannels[i];

        // Ищем видео, которое ≠ текущему
        for (const video of videoList) {
            if (video.videoId !== currentVideoId) {
                console.log(`[Selector] Выбрано видео из последней подборки: ${video.videoId} (канал: ${channelName})`);
                return video.videoId;
            }
        }
    }

    // 5. Fallback: первое видео ≠ текущему
    for (const video of lastBatch) {
        if (video.videoId !== currentVideoId) {
            console.log(`[Selector] Fallback: выбрано видео из последней подборки: ${video.videoId}`);
            return video.videoId;
        }
    }

    console.log("[Selector] Все видео из последней подборки = текущему видео");
    return null;
}

// Экспортируем
window.VideoSelector = {
    selectNextVideoId,
    selectNextVideoFromLastBatch
};