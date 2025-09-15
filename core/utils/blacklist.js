// core/utils/blacklist.js

const BLACKLIST_STORAGE_KEY = 'unavailableVideoIds';

/**
 * Получает Set недоступных videoId из хранилища.
 * @returns {Promise<Set<string>>} Множество недоступных ID.
 */
export async function getUnavailableVideoIds() {
    try {
        const result = await chrome.storage.local.get([BLACKLIST_STORAGE_KEY]);
        const idsArray = result[BLACKLIST_STORAGE_KEY] || [];
        return new Set(idsArray);
    } catch (e) {
        console.error("[Blacklist] Ошибка получения черного списка:", e);
        return new Set(); // Возвращаем пустой Set в случае ошибки
    }
}

/**
 * Добавляет один или несколько videoId в черный список.
 * @param {string | string[]} videoIds - ID видео или массив ID.
 * @returns {Promise<void>}
 */
export async function addUnavailableVideoIds(videoIds) {
    const idsToAdd = Array.isArray(videoIds) ? videoIds : [videoIds];
    if (idsToAdd.length === 0) return;

    try {
        const currentSet = await getUnavailableVideoIds();
        let changed = false;

        idsToAdd.forEach(id => {
            if (id && !currentSet.has(id)) {
                currentSet.add(id);
                changed = true;
            }
        });

        if (changed) {
            const newArray = Array.from(currentSet);
            await chrome.storage.local.set({ [BLACKLIST_STORAGE_KEY]: newArray });
            console.log(`[Blacklist] Добавлено ${idsToAdd.length} ID в черный список. Общий размер: ${newArray.length}`);
        } else {
            console.log("[Blacklist] Нет новых ID для добавления в черный список.");
        }
    } catch (e) {
        console.error("[Blacklist] Ошибка добавления в черный список:", e);
        throw e; // Пробрасываем ошибку для обработки выше
    }
}

/**
 * Проверяет, находится ли конкретный videoId в черном списке.
 * @param {string} videoId - ID видео.
 * @returns {Promise<boolean>}
 */
export async function isVideoUnavailable(videoId) {
    if (!videoId) return false;
    const blacklistSet = await getUnavailableVideoIds();
    return blacklistSet.has(videoId);
}