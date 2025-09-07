// core/selector.js

/**
 * Выбирает следующее видео для парсинга по алгоритму:
 * 1. Группирует по каналам
 * 2. Находит канал с наименьшим количеством видео
 * 3. Выбирает видео из этого канала, которое ещё не было исходным
 * @param {Array} videos — массив объектов { title, videoId, views, channelName, sourceVideoId }
 * @returns {string|null} videoId следующего видео или null
 */
function selectNextVideoId(videos) {
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

    // 2. Находим канал с наименьшим количеством видео
    let smallestChannel = null;
    let minCount = Infinity;

    for (const [channel, videoList] of Object.entries(channelGroups)) {
        if (videoList.length < minCount) {
            minCount = videoList.length;
            smallestChannel = channel;
        }
    }

    if (!smallestChannel) {
        return null;
    }

    // 3. Выбираем видео из этого канала, которое ещё не было исходным
    const candidateVideos = channelGroups[smallestChannel];
    for (const video of candidateVideos) {
        // Исключаем видео, которое уже было исходным (чтобы не зациклиться)
        if (video.videoId !== video.sourceVideoId) {
            return video.videoId;
        }
    }

    // Fallback: если все видео уже были исходными — берём первое
    return candidateVideos[0]?.videoId || null;
}

// Экспортируем
window.VideoSelector = {
    selectNextVideoId
};