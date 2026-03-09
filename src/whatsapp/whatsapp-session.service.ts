import { Logger } from '@nestjs/common';
import * as puppeteer from 'puppeteer';

export class WhatsappSession {
  private browser: puppeteer.Browser;
  private page: puppeteer.Page;
  private qrBase64: string | null = null;
  private isReady = false;
  private lastRestart = 0;
  private readonly RESTART_COOLDOWN = 15000;
  private readonly logger = new Logger(WhatsappSession.name);

  constructor(private readonly sessionId: string) {}

  async init() {
    this.logger.log(`[${this.sessionId}] Inicializando sesión...`);

    const headlessSuccess = await this.tryInit(true);
    if (!headlessSuccess) {
      this.logger.warn(
        `[${this.sessionId}] Headless falló, usando modo visible`,
      );
      await this.tryInit(false);
    }

    this.startWatcher();
  }

  async close() {
    try {
      await this.browser?.close();
    } catch {}

    const fs = await import('fs/promises');
    await fs.rm(this.getSessionFolder(), { recursive: true, force: true });
  }

  private getSessionFolder() {
    return `./whatsapp-sessions/${this.sessionId}`;
  }

  private async tryInit(headless: boolean): Promise<boolean> {
    try {
      this.browser = await puppeteer.launch({
        headless,
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
        userDataDir: this.getSessionFolder(),
      });

      this.page = await this.browser.newPage();

      await this.page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      );

      await this.page.goto('https://web.whatsapp.com', {
        waitUntil: 'networkidle2',
      });

      // Esperar a que el QR aparezca
      const qr = await this.waitForQR();
      if (!qr) {
        this.logger.error(`[${this.sessionId}] No se pudo capturar el QR`);
        await this.browser.close();
        return false;
      }

      this.qrBase64 = qr;
      this.isReady = true;
      this.logger.log(`[${this.sessionId}] Sesión inicializada correctamente`);
      return true;
    } catch (err) {
      this.logger.error(`[${this.sessionId}] Error en tryInit`, err);
      return false;
    }
  }

  // Espera activa hasta que el QR esté disponible
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

    // 1. Canvas correcto del QR
    try {
      const qrCanvas = await this.page.$(
        'canvas[aria-label="Scan this QR code to link a device!"]',
      );

      if (qrCanvas) {
        const box = await qrCanvas.boundingBox();
        if (box && box.width > 150 && box.height > 150) {
          const buffer = await qrCanvas.screenshot();
          this.logger.log(
            `[${this.sessionId}] QR capturado desde canvas correcto`,
          );
          return `data:image/png;base64,${Buffer.from(buffer).toString('base64')}`;
        }
      }
    } catch (err) {
      this.logger.warn(
        `[${this.sessionId}] Error capturando canvas correcto`,
        err,
      );
    }

    // 2. Fallback: contenedor del QR
    try {
      const qrContainer = await this.page.$('div[data-ref]');
      if (qrContainer) {
        const buffer = await qrContainer.screenshot();
        this.logger.warn(
          `[${this.sessionId}] QR capturado por fallback en contenedor`,
        );
        return `data:image/png;base64,${Buffer.from(buffer).toString('base64')}`;
      }
    } catch {}

    this.logger.warn(`[${this.sessionId}] No se encontró QR`);
    return null;
  }

  private startWatcher() {
    setInterval(async () => {
      if (!this.page || !this.browser) return;

      try {
        if (!this.browser.isConnected()) {
          this.logger.warn(`[${this.sessionId}] Browser desconectado`);
          return this.safeRestart();
        }

        const loggedIn = await this.page.$('[data-testid="chat-list-search"]');
        if (loggedIn) {
          this.isReady = true;
          return;
        }

        const qrVisible = await this.page.$('[data-testid="qrcode"]');
        if (qrVisible) {
          this.logger.warn(`[${this.sessionId}] QR visible → sesión perdida`);
          this.isReady = false;
          return this.safeRestart();
        }
      } catch (err) {
        this.logger.error(`[${this.sessionId}] Error en watcher`, err);
        return this.safeRestart();
      }
    }, 5000);
  }

  private async safeRestart() {
    const now = Date.now();
    if (now - this.lastRestart < this.RESTART_COOLDOWN) return;

    this.lastRestart = now;

    try {
      await this.browser?.close().catch(() => {});
    } catch {}

    await this.init();
  }

  getQR() {
    return this.qrBase64;
  }

  async sendMessage(phone: string, message: string) {
    if (!this.isReady) {
      throw new Error('Sesión no lista');
    }

    const url = `https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;

    await this.page.goto(url, { waitUntil: 'networkidle2' });

    const sendButton = 'span[data-icon="send"]';
    await this.page.waitForSelector(sendButton, { timeout: 15000 });
    await this.page.click(sendButton);

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
