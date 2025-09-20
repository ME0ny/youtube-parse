// popup/components/MetricIndicator.js

/**
 * Компонент для управления индикатором метрики в UI.
 * Слушает событие 'updateMetric' и обновляет соответствующий элемент.
 */
export class MetricIndicator {
    /**
     * @param {string} elementId - ID элемента, который нужно обновлять.
     */
    constructor(elementId) {
        this.element = document.getElementById(elementId);
        if (!this.element) {
            console.warn(`[MetricIndicator] Элемент с ID "${elementId}" не найден.`);
            return;
        }
        this.init();
    }

    init() {
        // Слушаем глобальное событие обновления метрик
        document.addEventListener('updateMetric', (e) => {
            this.handleUpdateMetric(e.detail);
        });
    }

    /**
     * Обрабатывает событие обновления метрики.
     * @param {Object} detail - Данные события.
     * @param {string} detail.metricName - Название метрики.
     * @param {number} detail.value - Значение метрики.
     * @param {string} detail.formattedValue - Отформатированное значение.
     */
    handleUpdateMetric(detail) {
        if (!this.element) return;

        const { metricName, value, formattedValue } = detail;

        // Для метрики 'russianChannelAverage' обновляем индикатор
        if (metricName === 'russianChannelAverage') {
            this.updateRussianChannelIndicator(value, formattedValue);
        }
        // Можно добавить обработку других метрик здесь
    }

    /**
     * Обновляет индикатор среднего количества русских каналов.
     * @param {number} value - Сырое значение метрики.
     * @param {string} formattedValue - Отформатированное значение для отображения.
     */
    updateRussianChannelIndicator(value, formattedValue) {
        if (!this.element) return;

        // Удаляем предыдущие классы состояния
        this.element.classList.remove('good', 'warning', 'bad');

        // Определяем класс состояния и текст
        let statusClass = 'good';
        let displayText = `${formattedValue}`;

        if (value > 7) {
            statusClass = 'good';
        } else if (value >= 5) {
            statusClass = 'warning';
        } else {
            statusClass = 'bad';
        }

        // Применяем класс состояния
        this.element.classList.add(statusClass);
        // Обновляем текст
        this.element.textContent = displayText;
    }
}