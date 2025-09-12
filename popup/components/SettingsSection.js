export class SettingsSection {
    constructor() {
        this.element = document.getElementById('settingsSection');
        this.toggleBtn = document.getElementById('toggleSettingsBtn');
        this.selectionModeRadios = document.querySelectorAll('input[name="selectionMode"]');
        this.iterationsInput = document.getElementById('iterationsInput');
        this.importTextarea = document.getElementById('importTextarea');
        this.importDataBtn = document.getElementById('importDataBtn');
        this.clearImportedBtn = document.getElementById('clearImportedBtn');

        this.init();
    }

    init() {
        // Восстанавливаем состояние из localStorage
        this.restoreState();

        // Обработчики
        this.toggleBtn.addEventListener('click', () => this.toggle());
        this.selectionModeRadios.forEach(radio => {
            radio.addEventListener('change', () => this.saveState());
        });
        this.iterationsInput.addEventListener('change', () => this.saveState());
        this.importDataBtn.addEventListener('click', () => this.handleImport());
        this.clearImportedBtn.addEventListener('click', () => this.handleClearImported());

        // Сохраняем при потере фокуса
        this.iterationsInput.addEventListener('blur', () => this.saveState());
    }

    toggle() {
        const isCollapsed = this.element.classList.contains('collapsed');
        if (isCollapsed) {
            this.expand();
        } else {
            this.collapse();
        }
        this.saveState();
    }

    collapse() {
        this.element.classList.add('collapsed');
        this.toggleBtn.textContent = '🔽';
    }

    expand() {
        this.element.classList.remove('collapsed');
        this.toggleBtn.textContent = '▲';
    }

    saveState() {
        const state = {
            isCollapsed: this.element.classList.contains('collapsed'),
            selectionMode: document.querySelector('input[name="selectionMode"]:checked')?.value || 'smart',
            iterations: this.iterationsInput.value,
        };
        localStorage.setItem('settingsState', JSON.stringify(state));
    }

    restoreState() {
        const saved = localStorage.getItem('settingsState');
        if (saved) {
            const state = JSON.parse(saved);
            if (state.isCollapsed) {
                this.collapse();
            } else {
                this.expand();
            }
            if (state.selectionMode) {
                const radio = document.querySelector(`input[name="selectionMode"][value="${state.selectionMode}"]`);
                if (radio) radio.checked = true;
            }
            if (state.iterations) {
                this.iterationsInput.value = state.iterations;
            }
        }
    }

    handleImport() {
        const text = this.importTextarea.value.trim();
        if (!text) {
            this.dispatchEvent('log', { message: '❌ Нет данных для импорта', level: 'error' });
            return;
        }

        try {
            const data = this.parseCSV(text);
            this.dispatchEvent('importData', { data });
            this.importTextarea.value = '';
            this.dispatchEvent('log', { message: `✅ Импортировано ${data.length} записей`, level: 'success' });
        } catch (err) {
            this.dispatchEvent('log', { message: `❌ Ошибка импорта: ${err.message}`, level: 'error' });
        }
    }

    handleClearImported() {
        this.dispatchEvent('clearImported');
        this.dispatchEvent('log', { message: '✅ Импортированные данные очищены', level: 'success' });
    }

    parseCSV(text) {
        const lines = text.split(/\r?\n/);
        if (lines.length === 0) throw new Error('Пустой файл');

        const headers = lines[0].split(/\t|,/).map(h => h.trim().toLowerCase());
        const required = ['название', 'id', 'просмотры', 'канал', 'исходное видео', 'миниатюра'];

        const fieldMap = {
            'название': 'title',
            'id': 'videoId',
            'просмотры': 'views',
            'канал': 'channelName',
            'исходное видео': 'sourceVideoId',
            'миниатюра': 'thumbnailUrl'
        };

        const indices = {};
        required.forEach(field => {
            const index = headers.findIndex(h => h === field);
            if (index === -1) throw new Error(`Не найдена колонка: ${field}`);
            indices[field] = index;
        });

        const data = [];
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            const cells = lines[i].split(/\t|,/);
            const item = {};
            required.forEach(field => {
                const index = indices[field];
                item[fieldMap[field]] = cells[index] ? cells[index].trim() : '';
            });
            data.push(item);
        }
        return data;
    }

    dispatchEvent(type, detail) {
        document.dispatchEvent(new CustomEvent(type, { detail }));
    }
}