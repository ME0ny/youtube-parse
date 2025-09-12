export class ControlSection {
    constructor() {
        this.startBtn = document.getElementById('startBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.copyTableBtn = document.getElementById('copyTableBtn');
        this.clearTableBtn = document.getElementById('clearTableBtn');
        this.clearLogBtn = document.getElementById('clearLogBtn');

        this.init();
    }

    init() {
        // Слушаем внутренние события от popup контроллера
        document.addEventListener('control:enableStart', () => this.enableStart());
        document.addEventListener('control:disableStart', () => this.disableStart());

        // Привязываем обработчики событий UI
        this.startBtn.addEventListener('click', () => {
            const iterations = parseInt(document.getElementById('iterationsInput').value) || 10;
            const mode = document.querySelector('input[name="selectionMode"]:checked')?.value || 'smart';
            document.dispatchEvent(new CustomEvent('startAnalysis', { detail: { iterations, mode } }));
        });

        this.stopBtn.addEventListener('click', () => {
            document.dispatchEvent(new CustomEvent('stopAnalysis'));
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

    enableStart() {
        this.startBtn.disabled = false;
        this.stopBtn.disabled = true;
    }

    disableStart() {
        this.startBtn.disabled = true;
        this.stopBtn.disabled = false;
    }

    dispatchEvent(type, detail) {
        document.dispatchEvent(new CustomEvent(type, { detail }));
    }
}