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
    const headlessSuccess = await this.tryInit(true);

    if (!headlessSuccess) {
      await this.tryInit(false);
    }

    this.startWatcher();
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

      await new Promise((r) => setTimeout(r, 1500));

      const qr = await this.captureQR();

      if (!qr) {
        await this.browser.close();
        return false;
      }

      this.qrBase64 = qr;
      this.isReady = true;
      return true;
    } catch {
      return false;
    }
  }

  private async captureQR(): Promise<string | null> {
    this.logger.log(`[${this.sessionId}] Intentando capturar QR...`);

    const canvasHandle = await this.findCanvas(this.page);

    if (canvasHandle) {
      try {
        const qr = await canvasHandle.evaluate((node: HTMLCanvasElement) =>
          node.toDataURL(),
        );
        return qr;
      } catch {}
    }

    try {
      const qrArea = await this.page.$('canvas, img, svg');
      if (qrArea) {
        const buffer = await qrArea.screenshot();
        this.logger.log(`[${this.sessionId}] QR capturado correctamente`);
        return `data:image/png;base64,${Buffer.from(buffer).toString('base64')}`;
      }
    } catch {
        this.logger.warn(`[${this.sessionId}] Canvas no encontrado, usando screenshot fallback`);
    }

    return null;
  }

  private async findCanvas(page: puppeteer.Page) {
    return await page.evaluateHandle(() => {
      function deepSearch(node) {
        if (node.tagName === 'CANVAS') return node;

        if (node.shadowRoot) {
          for (const child of node.shadowRoot.children) {
            const found = deepSearch(child);
            if (found) return found;
          }
        }

        for (const child of node.children) {
          const found = deepSearch(child);
          if (found) return found;
        }

        return null;
      }

      return deepSearch(document.body);
    });
  }

  private startWatcher() {
    setInterval(async () => {
      if (!this.page || !this.browser) return;

      try {
        if (!this.browser.isConnected()) {
          return this.safeRestart();
        }

        const loggedIn = await this.page.$('[data-testid="chat-list-search"]');
        if (loggedIn) {
          this.isReady = true;
          return;
        }

        const qrVisible = await this.page.$('[data-testid="qrcode"]');
        if (qrVisible) {
          this.isReady = false;
          return this.safeRestart();
        }
      } catch {
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

    const url = `https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(
      message,
    )}`;

    await this.page.goto(url, { waitUntil: 'networkidle2' });

    const sendButton = 'span[data-icon="send"]';
    await this.page.waitForSelector(sendButton, { timeout: 15000 });
    await this.page.click(sendButton);

    return { success: true };
  }
}
