// scenarios/test-countdown.js
import { logger } from '../background/background.js'; // Импортируем логгер из background

/**
 * @type {import('../core/types/scenario.types.js').ScenarioDefinition}
 */
export const testCountdownScenario = {
    id: 'test-countdown',
    name: 'Тестовый сценарий: Обратный отсчет',
    description: 'Считает от 1 до 10, логируя каждую секунду.',

    /**
     * @param {import('../core/types/scenario.types.js').ScenarioContext} context
     */
    async execute(context) {
        const { log, abortSignal } = context;
        const maxCount = 10;

        log(`🚀 Тестовый сценарий запущен. Начинаю отсчет до ${maxCount}.`, { module: 'TestScenario' });

        for (let i = 1; i <= maxCount; i++) {
            // Проверяем, не был ли запрос на остановку
            await abortSignal();

            log(`⏱️ Шаг ${i}/${maxCount}`, { module: 'TestScenario' });

            // Ждем 1 секунду
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        log(`🎉 Тестовый сценарий завершен.`, { module: 'TestScenario' });
    }
};