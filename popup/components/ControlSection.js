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
        this.startBtn.addEventListener('click', () => this.handleStart());
        this.stopBtn.addEventListener('click', () => this.handleStop());
        this.copyTableBtn.addEventListener('click', () => this.handleCopyTable());
        this.clearTableBtn.addEventListener('click', () => this.handleClearTable());
        this.clearLogBtn.addEventListener('click', () => this.handleClearLog());
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