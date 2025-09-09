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
async function selectNextVideoId(videos, currentVideoId = null, mode = 'smart') {
    if (!videos || videos.length === 0) {
        return null;
    }

    if (mode === 'batch') {
        return selectNextVideoFromLastBatch(videos, currentVideoId);
    }

    // === УМНЫЙ АЛГОРИТМ ===
    const channelGroups = {};
    videos.forEach(video => {
        const channel = video.channelName || 'Неизвестен';
        if (!channelGroups[channel]) {
            channelGroups[channel] = [];
        }
        channelGroups[channel].push(video);
    });

    const sortedChannels = Object.entries(channelGroups)
        .sort(([, a], [, b]) => a.length - b.length);

    for (let i = 0; i < Math.min(10, sortedChannels.length); i++) {
        const [channelName, videoList] = sortedChannels[i];

        // ✅ Проверяем: не текущее И не было исходным
        for (const video of videoList) {
            if (
                video.videoId !== currentVideoId &&
                video.videoId !== video.sourceVideoId
            ) {
                return video.videoId;
            }
        }

        // ✅ Fallback: просто не текущее
        for (const video of videoList) {
            if (video.videoId !== currentVideoId) {
                return video.videoId;
            }
        }
    }

    // ✅ Финальный fallback: первое не текущее из всей таблицы
    for (const video of videos) {
        if (
            video.videoId !== currentVideoId &&
            video.videoId !== video.sourceVideoId
        ) {
            return video.videoId;
        }
    }

    // ✅ Абсолютный fallback
    for (const video of videos) {
        if (video.videoId !== currentVideoId) {
            return video.videoId;
        }
    }

    return videos[0]?.videoId || null;
}

/**
 * Выбирает следующее видео только из последней подборки
 */
function selectNextVideoFromLastBatch(videos, currentVideoId) {
    if (!videos || videos.length === 0 || !currentVideoId) {
        return null;
    }

    const lastBatch = videos.filter(video => video.sourceVideoId === currentVideoId);

    if (lastBatch.length === 0) {
        console.log("[Selector] Нет видео из последней подборки");
        return null;
    }

    const channelGroups = {};
    lastBatch.forEach(video => {
        const channel = video.channelName || 'Неизвестен';
        if (!channelGroups[channel]) {
            channelGroups[channel] = [];
        }
        channelGroups[channel].push(video);
    });

    const sortedChannels = Object.entries(channelGroups)
        .sort(([, a], [, b]) => a.length - b.length);

    for (let i = 0; i < Math.min(10, sortedChannels.length); i++) {
        const [channelName, videoList] = sortedChannels[i];

        for (const video of videoList) {
            if (video.videoId !== currentVideoId) {
                return video.videoId;
            }
        }
    }

    for (const video of lastBatch) {
        if (video.videoId !== currentVideoId) {
            return video.videoId;
        }
    }

    return null;
}

// Экспортируем
window.VideoSelector = {
    selectNextVideoId,
    selectNextVideoFromLastBatch
};