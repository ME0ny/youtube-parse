export class ControlSection {
    constructor() {
        // Обновляем ID элементов в соответствии с popup.html
        this.runScenarioBtn = document.getElementById('runScenarioBtn'); // <-- Изменено
        this.stopBtn = document.getElementById('stopBtn');
        this.copyTableBtn = document.getElementById('copyTableBtn');
        this.clearTableBtn = document.getElementById('clearTableBtn');
        this.clearLogBtn = document.getElementById('clearLogBtn');
        this.resetIndicesBtn = document.getElementById('resetIndicesBtn');
        this.dumpIndicesBtn = document.getElementById('dumpIndicesBtn');
        // Добавляем ссылку на селектор сценариев
        this.scenarioSelector = document.getElementById('scenarioSelector'); // <-- Новое

        this.init();
    }

    init() {
        // Слушаем внутренние события от popup контроллера
        document.addEventListener('control:enableStart', () => this.enableStart());
        document.addEventListener('control:disableStart', () => this.disableStart());

        if (this.resetIndicesBtn) {
            this.resetIndicesBtn.addEventListener('click', () => this.handleResetIndices());
        } else {
            console.warn("[ControlSection] Кнопка 'resetIndicesBtn' не найдена в DOM.");
        }

        // 👇 НОВЫЙ обработчик для кнопки вывода состояния
        if (this.dumpIndicesBtn) {
            this.dumpIndicesBtn.addEventListener('click', () => this.handleDumpIndices());
        } else {
            console.warn("[ControlSection] Кнопка 'dumpIndicesBtn' не найдена в DOM.");
        }

        // Привязываем обработчики событий UI

        this.stopBtn.addEventListener('click', () => {
            document.dispatchEvent(new CustomEvent('stopAnalysis')); // Это событие уже отправляется
        });

        this.copyTableBtn.addEventListener('click', () => {
            document.dispatchEvent(new CustomEvent('copyTable'));
        });

        this.clearTableBtn.addEventListener('click', () => {
            document.dispatchEvent(new CustomEvent('clearTable'));
        });

        this.clearLogBtn.addEventListener('click', () => {
            document.dispatchEvent(new CustomEvent('clearLog'));
        });
    }

    handleStart() {
        const iterations = parseInt(document.getElementById('iterationsInput').value) || 10;
        const mode = document.querySelector('input[name="selectionMode"]:checked')?.value || 'smart';

        this.dispatchEvent('startAnalysis', { iterations, mode });
        this.startBtn.disabled = true;
        this.stopBtn.disabled = false;
    }

    handleStop() {
        this.dispatchEvent('stopAnalysis');
        this.startBtn.disabled = false;
        this.stopBtn.disabled = true;
    }

    handleCopyTable() {
        this.dispatchEvent('copyTable');
    }

    handleClearTable() {
        this.dispatchEvent('clearTable');
    }

    handleClearLog() {
        this.dispatchEvent('clearLog');
    }

    async handleResetIndices() {
        console.log("[ControlSection] Начало handleResetIndices");
        document.dispatchEvent(new CustomEvent('log', { detail: { message: '📤 Отправка команды на сброс индексов...', level: 'info' } }));

        try {
            // Отправляем сообщение в background
            const response = await chrome.runtime.sendMessage({
                action: "resetIndices"
            });

            if (response && response.status === "success") {
                console.log("[ControlSection] Индексы успешно сброшены в background");
                document.dispatchEvent(new CustomEvent('log', { detail: { message: '✅ Индексы успешно сброшены', level: 'success' } }));
                // Опционально: можно отправить событие, если другим компонентам нужно знать
                // document.dispatchEvent(new CustomEvent('indicesReset'));
            } else {
                const errorMsg = response?.message || 'Неизвестная ошибка';
                console.error("[ControlSection] Ошибка сброса индексов в background:", errorMsg);
                document.dispatchEvent(new CustomEvent('log', { detail: { message: `❌ Ошибка сброса индексов: ${errorMsg}`, level: 'error' } }));
            }
        } catch (err) {
            console.error("[ControlSection] Ошибка отправки команды сброса индексов в background:", err);
            document.dispatchEvent(new CustomEvent('log', { detail: { message: `❌ Ошибка связи: ${err.message}`, level: 'error' } }));
        }
    }

    async handleDumpIndices() {
        console.log("[ControlSection] Начало handleDumpIndices");
        document.dispatchEvent(new CustomEvent('log', { detail: { message: '🔍 Запрос состояния индексов...', level: 'info' } }));

        try {
            // Отправляем сообщение в background для получения состояния
            const response = await chrome.runtime.sendMessage({
                action: "getIndexState"
            });

            if (response && response.status === "success") {
                const state = response.serializableState;
                console.log("[ControlSection] === Состояние индексов IndexManager ===");

                // Выводим данные из объекта state с пояснениями
                // 👇 ОБНОВЛЕНО: Выводим только первые 10 элементов для каждой структуры
                console.log(`scrapedDataBuffer:`, `${state.scrapedDataBuffer_count} элементов`, state.scrapedDataBuffer_sample.slice(0, 10));
                console.log(`visitedVideoIds:`, `${state.visitedVideoIds_count} элементов`, Array.from(state.visitedVideoIds_sample).slice(0, 10));
                console.log(`channelVideoCounts:`, `${state.channelVideoCounts_count} элементов`, Object.fromEntries(
                    Object.entries(state.channelVideoCounts_sample).slice(0, 10)
                ));
                console.log(`channelToVideoIds:`, `${state.channelToVideoIds_count} элементов`, Object.fromEntries(
                    Object.entries(state.channelToVideoIds_sample).slice(0, 10).map(([k, v]) => [k, v.slice(0, 3)])
                ));
                console.log("[ControlSection] === Конец состояния индексов ===");

                document.dispatchEvent(new CustomEvent('log', { detail: { message: '✅ Состояние индексов выведено в консоль background', level: 'success' } }));
            } else {
                const errorMsg = response?.message || 'Неизвестная ошибка';
                console.error("[ControlSection] Ошибка получения состояния индексов из background:", errorMsg);
                document.dispatchEvent(new CustomEvent('log', { detail: { message: `❌ Ошибка получения состояния индексов: ${errorMsg}`, level: 'error' } }));
            }
        } catch (err) {
            console.error("[ControlSection] Ошибка отправки запроса состояния индексов в background:", err);
            document.dispatchEvent(new CustomEvent('log', { detail: { message: `❌ Ошибка связи: ${err.message}`, level: 'error' } }));
        }
    }

    enableStart() {
        // Логика включена в PopupApp.updateScenarioControlButtons
        if (this.runScenarioBtn) this.runScenarioBtn.disabled = false;
        if (this.stopBtn) this.stopBtn.disabled = true;
    }

    disableStart() {
        // Логика включена в PopupApp.updateScenarioControlButtons
        if (this.runScenarioBtn) this.runScenarioBtn.disabled = true;
        if (this.stopBtn) this.stopBtn.disabled = false;
    }

    dispatchEvent(type, detail) {
        document.dispatchEvent(new CustomEvent(type, { detail }));
    }
}
