// scenarios/test-countdown.js
import { logger } from '../background/background.js';
import { tableAdapter } from '../background/background.js'; // Импортируем адаптер таблицы

/**
 * Генерирует случайную строку заданной длины.
 * @param {number} length
 * @returns {string}
 */
function generateRandomString(length) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

/**
 * Генерирует случайное число просмотров.
 * @returns {string}
 */
function generateRandomViews() {
    const num = Math.floor(Math.random() * 1000000);
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
}

/**
 * @type {import('../core/types/scenario.types.js').ScenarioDefinition}
 */
export const testCountdownScenario = {
    id: 'test-countdown',
    name: 'Тестовый сценарий: Обратный отсчет',
    description: 'Считает от 1 до 10, логируя каждую секунду и записывая случайные данные в таблицу.',

    /**
     * @param {import('../core/types/scenario.types.js').ScenarioContext} context
     */
    async execute(context) {
        const { log, abortSignal } = context;
        const maxCount = 10;
        // Для теста будем использовать фиксированный ID исходного видео
        const sourceVideoId = 'test_source_video_id';

        log(`🚀 Тестовый сценарий запущен. Начинаю отсчет до ${maxCount}.`, { module: 'TestScenario' });

        for (let i = 1; i <= maxCount; i++) {
            // Проверяем, не был ли запрос на остановку
            await abortSignal();

            log(`⏱️ Шаг ${i}/${maxCount}`, { module: 'TestScenario' });

            // --- НОВОЕ: Запись случайных данных в таблицу ---
            try {
                const randomVideoData = {
                    videoId: `test_video_${generateRandomString(8)}`,
                    title: `Тестовое видео ${i}: ${generateRandomString(15)}`,
                    channelName: `Тестовый канал ${generateRandomString(5)}`,
                    views: generateRandomViews(),
                    sourceVideoId: sourceVideoId,
                    thumbnailUrl: `https://picsum.photos/seed/${i}/120/90`, // URL к случайной картинке
                    timestamp: Date.now()
                };

                await tableAdapter.add(randomVideoData);
                log(`💾 Данные шага ${i} записаны в таблицу.`, { module: 'TestScenario' });
            } catch (err) {
                log(`❌ Ошибка записи данных шага ${i}: ${err.message}`, { module: 'TestScenario', level: 'error' });
            }
            // --- Конец нового кода ---

            // Ждем 1 секунду
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        log(`🎉 Тестовый сценарий завершен.`, { module: 'TestScenario' });
    }
};