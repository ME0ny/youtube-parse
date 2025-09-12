// core/data-processor.js

/**
 * @typedef {import('./types/table.types.js').VideoData} VideoData
 */

/**
 * Подготавливает индексы и структуры данных из массива видео (например, импортированных).
 * @param {VideoData[]} videoDataArray - Массив объектов видео.
 * @returns {Object} Объект с подготовленными структурами.
 * @returns {Set<string>} .visitedVideoIds - Множество ID видео, НА КОТОРЫЕ УЖЕ ЗАХОДИЛИ (sourceVideoId).
 * @returns {Map<string, number>} .channelVideoCounts - Словарь: канал -> количество видео из этого канала.
 * @returns {Map<string, Set<string>>} .channelToVideoIds - Словарь: канал -> множество ID видео этого канала (videoId).
 */
export function prepareImportedDataIndices(videoDataArray) {
    // 1. Сет видео, на которые уже заходили (sourceVideoId)
    // Это видео, с которых был совершен переход, т.е. они уже были "текущими".
    const visitedVideoIds = new Set();

    // 2. Словарь: канал -> количество видео из этого канала
    const channelVideoCounts = new Map();

    // 3. Словарь: канал -> множество ID видео этого канала (videoId)
    const channelToVideoIds = new Map();

    if (!Array.isArray(videoDataArray)) {
        console.warn("[DataProcessor] Входные данные не являются массивом.");
        return { visitedVideoIds, channelVideoCounts, channelToVideoIds };
    }

    for (const video of videoDataArray) {
        // --- 1. Заполняем visitedVideoIds ---
        // ВАЖНО: Используем sourceVideoId, так как это ID видео,
        // на котором мы "останавливались" и с которого переходили.
        // Это предотвратит повторный переход на это же видео.
        if (video.sourceVideoId) {
            visitedVideoIds.add(video.sourceVideoId);
        }
        // Если нужно также отслеживать videoId (например, чтобы не добавлять дубликаты видео в таблицу),
        // можно добавить отдельный сет, например, allParsedVideoIds. Но для visitedVideoIds - это sourceVideoId.

        // --- 2. Заполняем channelVideoCounts ---
        const channel = video.channelName || 'Неизвестный канал';
        const currentCount = channelVideoCounts.get(channel) || 0;
        channelVideoCounts.set(channel, currentCount + 1);

        // --- 3. Заполняем channelToVideoIds ---
        // Здесь используем videoId, так как мы хотим знать, какие конкретные видео
        // принадлежат каналу.
        if (!channelToVideoIds.has(channel)) {
            channelToVideoIds.set(channel, new Set());
        }
        if (video.videoId) {
            channelToVideoIds.get(channel).add(video.videoId);
        }
    }

    return {
        visitedVideoIds,
        channelVideoCounts,
        channelToVideoIds
    };
}