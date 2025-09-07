// shared/storage.js

const STORAGE_KEY = 'parsedVideos';

async function getVideos() {
    return new Promise(resolve => {
        chrome.storage.local.get([STORAGE_KEY], result => {
            resolve(result[STORAGE_KEY] || []);
        });
    });
}

async function saveVideos(videos) {
    return new Promise(resolve => {
        chrome.storage.local.set({ [STORAGE_KEY]: videos }, () => {
            resolve();
        });
    });
}

async function appendVideos(newVideos) {
    const existing = await getVideos();
    const combined = [...existing, ...newVideos];
    await saveVideos(combined);
    return combined;
}

async function clearVideos() {
    return new Promise(resolve => {
        chrome.storage.local.remove([STORAGE_KEY], () => {
            resolve();
        });
    });
}

// 👇 Экспортируем в глобальный объект
window.VideoStorage = {
    get: getVideos,
    save: saveVideos,
    append: appendVideos,
    clear: clearVideos
};