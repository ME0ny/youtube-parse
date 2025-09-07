// shared/storage.js

const STORAGE_KEY = 'parsedVideos';

/**
 * Получает данные из хранилища
 * @returns {Promise<Object[]>}
 */
async function getVideos() {
    return new Promise((resolve) => {
        chrome.storage.local.get([STORAGE_KEY], (result) => {
            resolve(result[STORAGE_KEY] || []);
        });
    });
}

/**
 * Сохраняет массив видео (перезаписывает)
 * @param {Object[]} videos
 * @returns {Promise<void>}
 */
async function saveVideos(videos) {
    return new Promise((resolve) => {
        chrome.storage.local.set({ [STORAGE_KEY]: videos }, () => {
            resolve();
        });
    });
}

/**
 * Добавляет видео в конец существующего массива
 * @param {Object[]} newVideos
 * @returns {Promise<void>}
 */
async function appendVideos(newVideos) {
    const existing = await getVideos();
    const combined = [...existing, ...newVideos];
    await saveVideos(combined);
    return combined;
}

/**
 * Очищает хранилище
 * @returns {Promise<void>}
 */
async function clearVideos() {
    return new Promise((resolve) => {
        chrome.storage.local.remove([STORAGE_KEY], () => {
            resolve();
        });
    });
}

// Экспортируем
window.VideoStorage = {
    get: getVideos,
    save: saveVideos,
    append: appendVideos,
    clear: clearVideos
};