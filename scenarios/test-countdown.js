// scenarios/test-countdown.js
import { logger } from '../background/background.js';
import { tableAdapter } from '../background/background.js';

// --- Переносим вспомогательные функции внутрь модуля ---
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
// --- Конец вспомогательных функций ---

/**
 * @type {import('../core/types/scenario.types.js').ScenarioDefinition}
 */
export const testCountdownScenario = {
    id: 'test-countdown',
    name: 'Тестовый сценарий: Обратный отсчет',
    description: 'Считает от 1 до N, где N - количество итераций из настроек. Логирует выбранный алгоритм.',

    /**
     * @param {import('../core/types/scenario.types.js').ScenarioContext} context
     */
    async execute(context) {
        // 1. Получаем параметры из контекста
        const { log, abortSignal, params = {} } = context;

        // 2. Извлекаем параметры или используем значения по умолчанию
        // ВАЖНО: ключи params должны совпадать с тем, что отправляется из popup/background
        const maxCount = parseInt(params.iterations, 10) || 10;
        // Интерпретируем внутренние значения mode в человекочитаемые названия для логов
        let selectionModeLabel = 'Неизвестный режим';
        if (params.mode === 'all_videos') {
            selectionModeLabel = 'Анализ всех видео';
        } else if (params.mode === 'current_recommendations') {
            selectionModeLabel = 'Анализ видео из последней подборки';
        }
        // Используем внутреннее значение mode для логики (если потребуется в будущем)
        const mode = params.mode || 'all_videos';
        const sourceVideoId = 'test_source_video_id'; // Для теста

        // 3. Логируем начальные параметры (используем человекочитаемое название)
        log(`🚀 Тестовый сценарий запущен.`, { module: 'TestScenario' });
        log(`🔢 Количество шагов: ${maxCount}`, { module: 'TestScenario' });
        log(`🧠 Алгоритм выбора: ${selectionModeLabel}`, { module: 'TestScenario' });
        // 4. Основной цикл
        for (let i = 1; i <= maxCount; i++) {
            // Проверяем, не был ли запрос на остановку
            await abortSignal();

            log(`⏱️ Шаг ${i}/${maxCount}`, { module: 'TestScenario' });

            // --- Запись случайных данных в таблицу ---
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
            // --- Конец записи данных ---

            // Ждем 1 секунду
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // 5. Логируем завершение и снова указываем параметры
        log(`🎉 Тестовый сценарий завершен.`, { module: 'TestScenario' });
        log(`🧠 Использованный алгоритм: ${selectionModeLabel}`, { module: 'TestScenario' });
        log(`🔢 Выполнено шагов: ${maxCount}`, { module: 'TestScenario' });
    }
};