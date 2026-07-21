// core/machine-fingerprint.js
/**
 * Генерация детерминированного machineId на основе fingerprint устройства.
 * НЕ использует:
 *   - chrome.storage (очищается при удалении расширения)
 *   - timezone (может меняться пользователем)
 *   - userAgent (меняется при обновлении браузера)
 *   - screen resolution (меняется при подключении монитора)
 *
 * Использует ТОЛЬКО:
 *   - hardwareConcurrency (ядра CPU)
 *   - deviceMemory (ОЗУ)
 *   - platform (ОС)
 *   - Canvas fingerprint (GPU + драйверы)
 *   - WebGL vendor/renderer (видеокарта)
 */

const MODULE_NAME = 'MachineFingerprint';

/**
 * Вычисляет SHA-256 хеш строки.
 * @param {string} str
 * @returns {Promise<string>} hex-строка
 */
async function sha256(str) {
    const buffer = new TextEncoder().encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Canvas fingerprint через OffscreenCanvas (доступен в Service Worker).
 * @returns {Promise<string>}
 */
async function getCanvasFingerprint() {
    try {
        // OffscreenCanvas доступен в Manifest V3 service worker
        const canvas = new OffscreenCanvas(256, 64);
        const ctx = canvas.getContext('2d');
        if (!ctx) return 'no-canvas-ctx';

        // Рисуем текст с градиентом и тенью — результат зависит от GPU/шрифтов/AA
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillStyle = '#f60';
        ctx.fillRect(50, 0, 50, 20);
        ctx.fillStyle = '#069';
        ctx.fillText('machineId~🔐@2', 2, 15);

        const bitmap = await canvas.convertToBlob({ type: 'image/png' });
        const arrayBuffer = await bitmap.arrayBuffer();
        return await sha256(new Uint8Array(arrayBuffer).toString());
    } catch (e) {
        console.warn(`[${MODULE_NAME}] Canvas fingerprint error:`, e);
        return 'canvas-error';
    }
}

/**
 * WebGL vendor и renderer через OffscreenCanvas.
 * @returns {Promise<{vendor: string, renderer: string}>}
 */
async function getWebGLInfo() {
    try {
        const canvas = new OffscreenCanvas(1, 1);
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!gl) return { vendor: 'no-webgl', renderer: 'no-webgl' };

        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        const vendor = debugInfo
            ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
            : gl.getParameter(gl.VENDOR);
        const renderer = debugInfo
            ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
            : gl.getParameter(gl.RENDERER);

        return { vendor: vendor || 'unknown', renderer: renderer || 'unknown' };
    } catch (e) {
        console.warn(`[${MODULE_NAME}] WebGL info error:`, e);
        return { vendor: 'webgl-error', renderer: 'webgl-error' };
    }
}

/**
 * Генерирует детерминированный machineId для текущей машины.
 * При вызове на одной и той же машине всегда возвращает одинаковый результат.
 * @returns {Promise<string>} machineId в формате "fp-<sha256>"
 */
export async function generateMachineId() {
    const components = [];

    // 1. CPU cores
    components.push(`hc:${navigator.hardwareConcurrency ?? 'u'}`);

    // 2. Device memory (GB)
    components.push(`dm:${navigator.deviceMemory ?? 'u'}`);

    // 3. Platform (OS)
    components.push(`pl:${navigator.platform || 'u'}`);

    // 4. Canvas fingerprint
    const canvasHash = await getCanvasFingerprint();
    components.push(`cv:${canvasHash.substring(0, 16)}`);

    // 5. WebGL
    const webgl = await getWebGLInfo();
    components.push(`gl:${webgl.vendor}|${webgl.renderer}`);

    const raw = components.join('|');
    console.log(`[${MODULE_NAME}] Fingerprint components:`, components);

    const hash = await sha256(raw);
    const machineId = `fp-${hash.substring(0, 32)}`;

    console.log(`[${MODULE_NAME}] Generated machineId: ${machineId}`);
    return machineId;
}