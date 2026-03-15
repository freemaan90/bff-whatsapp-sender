import { Logger } from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import { exec } from 'child_process';

export class WhatsappSession {
  private browser: puppeteer.Browser;
  private page: puppeteer.Page;
  private qrBase64: string | null = null;
  private isReady = false;
  private lastRestart = 0;
  private readonly logger = new Logger(WhatsappSession.name);

  constructor(private readonly sessionId: string) {}

  // ---------------------------
  // Paths de sesión
  // ---------------------------
  private getSessionFolder() {
    return `./whatsapp-sessions/${this.sessionId}`;
  }

  // ---------------------------
  // Ciclo de vida
  // ---------------------------
  async init() {
    this.logger.log(`[${this.sessionId}] Inicializando sesión (headless only)...`);
    await this.safeLaunch();
  }

  async close() {
    try {
      await this.browser?.close();
    } catch {}

    const fs = await import('fs/promises');
    await fs.rm(this.getSessionFolder(), { recursive: true, force: true });
  }

  // ---------------------------
  // SAFE LAUNCH (solo headless)
  // ---------------------------
  private async safeLaunch(): Promise<boolean> {
    const folder = this.getSessionFolder();

    await this.removeChromeLock(folder);
    await this.cleanCorruptedFiles(folder);
    await this.killChromeProcesses(folder);

    // pequeño delay para liberar el userDataDir
    await new Promise((r) => setTimeout(r, 300));

    return this.tryInit();
  }

  // ---------------------------
  // Limpieza de locks / archivos corruptos
  // ---------------------------
  private async removeChromeLock(folder: string) {
    const fs = await import('fs/promises');
    const lockPath = `${folder}/SingletonLock`;

    try {
      await fs.rm(lockPath, { force: true });
      this.logger.warn(`[${this.sessionId}] SingletonLock eliminado`);
    } catch {}
  }

  private async cleanCorruptedFiles(folder: string) {
    const fs = await import('fs/promises');

    const corrupted = [
      'SingletonLock',
      'LOCK',
      'Crashpad',
      'BrowserMetrics',
      'BrowserMetrics-spare.pma',
      'GPUCache',
    ];

    for (const file of corrupted) {
      try {
        await fs.rm(`${folder}/${file}`, { recursive: true, force: true });
      } catch {}
    }
  }

  // ---------------------------
  // Kill de procesos Chrome
  // ---------------------------
  private killChromeProcesses(userDataDir: string): Promise<void> {
    return new Promise((resolve) => {
      exec(`pgrep -f "${userDataDir}"`, (err, stdout) => {
        if (err || !stdout) return resolve();

        const pids = stdout.split('\n').filter(Boolean);

        pids.forEach((pid) => {
          exec(`kill -9 ${pid}`);
          this.logger.warn(`[${this.sessionId}] Proceso Chrome matado: ${pid}`);
        });

        resolve();
      });
    });
  }

  // ---------------------------
  // Lanzar Puppeteer + QR
  // ---------------------------
  private async tryInit(): Promise<boolean> {
    const userDataDir = this.getSessionFolder();

    try {
      this.browser = await puppeteer.launch({
        headless: true, // 🔥 SIEMPRE HEADLESS
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-software-rasterizer',
          '--enable-webgl',
          '--use-gl=swiftshader',
          '--window-size=1280,800',
        ],
        defaultViewport: { width: 1280, height: 800 },
        userDataDir,
      });

      this.page = await this.browser.newPage();

      await this.page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      );

      await this.page.goto('https://web.whatsapp.com', {
        waitUntil: 'networkidle2',
        timeout: 60000,
      });

      this.logger.log(`[${this.sessionId}] Página cargada, detectando estado...`);

      // Esperar hasta 15s a que aparezca o el panel de chats (ya autenticado) o el QR
      const state = await this.detectPageState(15000);
      this.logger.log(`[${this.sessionId}] Estado detectado: ${state}`);

      if (state === 'authenticated') {
        this.isReady = true;
        this.qrBase64 = null;
        this.logger.log(`[${this.sessionId}] ✅ Sesión ya autenticada (sin QR necesario)`);
        return true;
      }

      if (state === 'qr') {
        // Esperar el QR
        const qr = await this.waitForQR();
        if (!qr) {
          this.logger.error(`[${this.sessionId}] No se pudo capturar el QR`);
          await this.browser.close();
          return false;
        }

        this.qrBase64 = qr;
        this.logger.log(`[${this.sessionId}] QR generado, esperando escaneo...`);

        // Esperar a que se autentique (en background)
        this.waitForAuthentication();
        return true;
      }

      // Estado desconocido — tomar screenshot para debug y asumir que necesita QR
      this.logger.warn(`[${this.sessionId}] Estado desconocido, intentando capturar QR de todas formas...`);
      const qr = await this.waitForQR();
      if (qr) {
        this.qrBase64 = qr;
        this.waitForAuthentication();
        return true;
      }

      await this.browser.close();
      return false;

    } catch (err) {
      this.logger.error(`[${this.sessionId}] Error en tryInit`, err);

      const msg = (err as Error)?.message || '';
      if (msg.includes('The browser is already running')) {
        this.logger.warn(`[${this.sessionId}] Chrome ya estaba corriendo → matando procesos...`);
        await this.killChromeProcesses(userDataDir);
      }

      return false;
    }
  }

  // ---------------------------
  // Detectar estado de la página (autenticado vs QR vs desconocido)
  // ---------------------------
  private async detectPageState(timeoutMs: number): Promise<'authenticated' | 'qr' | 'unknown'> {
    // Selectores que indican sesión activa
    const authSelectors = [
      'div[data-testid="conversation-panel-wrapper"]',
      '#side',                          // panel lateral de chats
      'div[data-testid="chat-list"]',
      'header[data-testid="chatlist-header"]',
    ];

    // Selectores que indican pantalla de QR
    const qrSelectors = [
      'canvas[aria-label="Scan this QR code to link a device!"]',
      'div[data-ref]',
      'div[data-testid="qrcode"]',
    ];

    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      try {
        for (const sel of authSelectors) {
          const el = await this.page.$(sel);
          if (el) {
            this.logger.log(`[${this.sessionId}] Selector autenticado encontrado: ${sel}`);
            return 'authenticated';
          }
        }

        for (const sel of qrSelectors) {
          const el = await this.page.$(sel);
          if (el) {
            this.logger.log(`[${this.sessionId}] Selector QR encontrado: ${sel}`);
            return 'qr';
          }
        }
      } catch (err) {
        this.logger.warn(`[${this.sessionId}] Error en detectPageState: ${(err as Error).message}`);
      }

      await new Promise((r) => setTimeout(r, 500));
    }

    // Loguear el HTML de la página para debug
    try {
      const title = await this.page.title();
      const url = this.page.url();
      // Capturar los primeros elementos del body para entender qué hay en la página
      const bodyContent = await this.page.evaluate(() => {
        const els = document.body.querySelectorAll('[data-testid]');
        return Array.from(els).slice(0, 10).map(el => el.getAttribute('data-testid')).join(', ');
      }).catch(() => 'no se pudo obtener');
      this.logger.warn(`[${this.sessionId}] Timeout detectando estado. Título="${title}" url="${url}" data-testids=[${bodyContent}]`);
    } catch {}

    return 'unknown';
  }

  // ---------------------------
  // Esperar autenticación
  // ---------------------------
  private async waitForAuthentication() {
    const authSelectors = [
      '#side',
      'div[data-testid="conversation-panel-wrapper"]',
      'div[data-testid="chat-list"]',
      'header[data-testid="chatlist-header"]',
      'div[aria-label="Chat list"]',
      'div[data-testid="default-user"]',
    ];

    const deadline = Date.now() + 120000; // 2 minutos

    while (Date.now() < deadline) {
      // Si ya está listo (ej: detectPageState lo marcó), salir
      if (this.isReady) return;

      for (const sel of authSelectors) {
        try {
          const el = await this.page.$(sel);
          if (el) {
            this.isReady = true;
            this.qrBase64 = null;
            this.logger.log(`[${this.sessionId}] ✅ Sesión autenticada correctamente (selector: ${sel})`);
            return;
          }
        } catch {}
      }

      await new Promise((r) => setTimeout(r, 500));
    }

    this.isReady = false;
    this.logger.error(`[${this.sessionId}] ❌ Timeout esperando autenticación`);
  }

  // ---------------------------
  // QR
  // ---------------------------
  private async waitForQR(): Promise<string | null> {
    for (let i = 0; i < 20; i++) {
      const qr = await this.captureQR();
      if (qr) return qr;
      await new Promise((r) => setTimeout(r, 500));
    }
    return null;
  }

  private async captureQR(): Promise<string | null> {
    this.logger.log(`[${this.sessionId}] Buscando QR...`);

    try {
      const qrCanvas = await this.page.$(
        'canvas[aria-label="Scan this QR code to link a device!"]',
      );

      if (qrCanvas) {
        const box = await qrCanvas.boundingBox();
        if (box && box.width > 150 && box.height > 150) {
          const buffer = await qrCanvas.screenshot();
          const qrImage = `data:image/png;base64,${Buffer.from(buffer).toString('base64')}`;
          this.logger.log(`[${this.sessionId}] QR capturado`);
          return qrImage;
        }
      }
    } catch {}

    try {
      const qrContainer = await this.page.$('div[data-ref]');
      if (qrContainer) {
        const buffer = await qrContainer.screenshot();
        this.logger.warn(`[${this.sessionId}] QR capturado por fallback`);
        return `data:image/png;base64,${Buffer.from(buffer).toString('base64')}`;
      }
    } catch {}

    this.logger.warn(`[${this.sessionId}] No se encontró QR`);
    return null;
  }

  // ---------------------------
  // API pública
  // ---------------------------
  getQR() {
    return this.qrBase64;
  }

  async sendMessage(phone: string, message: string) {
      if (!this.isReady) {
        throw new Error('Sesión no lista');
      }

      const phoneFormatted = phone.startsWith('+') ? phone : `+${phone}`;
      this.logger.log(`[${this.sessionId}] Enviando mensaje a ${phoneFormatted}`);

      // Abrir nueva conversación via botón "New chat" en la UI de WhatsApp Web
      const newChatSelectors = [
        'div[data-testid="new-chat-btn"]',
        'span[data-testid="new-chat-btn"]',
        'div[aria-label="New chat"]',
        'span[data-icon="new-chat-outline"]',
      ];

      let newChatBtn: any = null;
      for (const sel of newChatSelectors) {
        try {
          newChatBtn = await this.page.$(sel);
          if (newChatBtn) {
            this.logger.log(`[${this.sessionId}] Botón nuevo chat: ${sel}`);
            break;
          }
        } catch {}
      }

      if (!newChatBtn) {
        // Dump de testids para debug
        try {
          const testids = await this.page.evaluate(() =>
            Array.from(document.querySelectorAll('[data-testid]'))
              .slice(0, 20).map((el) => el.getAttribute('data-testid')).join(', '),
          );
          this.logger.error(`[${this.sessionId}] No se encontró botón nuevo chat. testids=[${testids}]`);
        } catch {}
        throw new Error('No se encontró el botón de nuevo chat');
      }

      await newChatBtn.click();
      await new Promise((r) => setTimeout(r, 1000));

      // Buscar el input de búsqueda de contacto
      const searchSelectors = [
        'div[data-testid="chat-list-search"]',
        'div[contenteditable="true"][data-tab="3"]',
        'input[type="text"]',
      ];

      let searchEl: any = null;
      for (const sel of searchSelectors) {
        try {
          await this.page.waitForSelector(sel, { timeout: 5000 });
          searchEl = await this.page.$(sel);
          if (searchEl) {
            this.logger.log(`[${this.sessionId}] Input búsqueda: ${sel}`);
            break;
          }
        } catch {}
      }

      if (!searchEl) {
        throw new Error('No se encontró el input de búsqueda');
      }

      // Escribir el número de teléfono
      await searchEl.click();
      await new Promise((r) => setTimeout(r, 300));
      await this.page.keyboard.type(phoneFormatted, { delay: 50 });
      await new Promise((r) => setTimeout(r, 2000));

      this.logger.log(`[${this.sessionId}] Buscando contacto ${phoneFormatted}...`);

      // Seleccionar el primer resultado
      const resultSelectors = [
        'div[data-testid="cell-frame-container"]',
        'div[data-testid="chat-list-item"]',
        'div[role="listitem"]',
      ];

      let resultEl: any = null;
      for (const sel of resultSelectors) {
        try {
          await this.page.waitForSelector(sel, { timeout: 5000 });
          resultEl = await this.page.$(sel);
          if (resultEl) {
            this.logger.log(`[${this.sessionId}] Resultado encontrado: ${sel}`);
            break;
          }
        } catch {}
      }

      if (!resultEl) {
        throw new Error(`No se encontró el contacto ${phoneFormatted}`);
      }

      await resultEl.click();
      await new Promise((r) => setTimeout(r, 1000));

      // Esperar el compose box
      const inputSelectors = [
        'div[data-testid="conversation-compose-box-input"]',
        'div[contenteditable="true"][data-tab="10"]',
        'footer div[contenteditable="true"]',
        'div[contenteditable="true"]',
      ];

      let inputEl: any = null;
      for (const sel of inputSelectors) {
        try {
          await this.page.waitForSelector(sel, { timeout: 10000 });
          inputEl = await this.page.$(sel);
          if (inputEl) {
            this.logger.log(`[${this.sessionId}] Compose box: ${sel}`);
            break;
          }
        } catch {}
      }

      if (!inputEl) {
        try {
          const testids = await this.page.evaluate(() =>
            Array.from(document.querySelectorAll('[data-testid]'))
              .slice(0, 20).map((el) => el.getAttribute('data-testid')).join(', '),
          );
          this.logger.error(`[${this.sessionId}] url="${this.page.url()}" testids=[${testids}]`);
        } catch {}
        throw new Error(`No se pudo abrir el chat para ${phone}`);
      }

      // Escribir y enviar
      await inputEl.click();
      await new Promise((r) => setTimeout(r, 300));
      await this.page.keyboard.type(message, { delay: 30 });
      await new Promise((r) => setTimeout(r, 500));

      const sendSelectors = [
        'button[data-testid="compose-btn-send"]',
        'button[aria-label="Send"]',
        'button[aria-label="Enviar"]',
        'span[data-icon="send"]',
      ];

      let sent = false;
      for (const sel of sendSelectors) {
        try {
          const btn = await this.page.$(sel);
          if (btn) {
            await btn.click();
            sent = true;
            this.logger.log(`[${this.sessionId}] Enviado con: ${sel}`);
            break;
          }
        } catch {}
      }

      if (!sent) {
        await this.page.keyboard.press('Enter');
        this.logger.log(`[${this.sessionId}] Enviado con Enter`);
      }

      this.logger.log(`[${this.sessionId}] ✅ Mensaje enviado a ${phone}`);
      await new Promise((r) => setTimeout(r, 1000));

      return { success: true };
    }

  getStatus() {
    return {
      sessionId: this.sessionId,
      isReady: this.isReady,
      qrBase64: this.qrBase64,
      hasBrowser: !!this.browser,
      hasPage: !!this.page,
      lastRestart: this.lastRestart,
    };
  }
}
