// whatsapp.service.ts
import { Injectable, Logger } from '@nestjs/common';
import * as puppeteer from 'puppeteer';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private browser: puppeteer.Browser;
  private page: puppeteer.Page;
  private qrBase64: string | null = null;
  private isReady = false;

  // Cooldown para evitar reinicios en loop
  private lastRestart = 0;
  private readonly RESTART_COOLDOWN = 15000; // 15 segundos

  private startWatcher() {
    setInterval(async () => {
      if (!this.page || !this.browser) return;

      try {
        const now = Date.now();

        // 1. Si el browser está desconectado → reiniciar
        if (!this.browser.isConnected()) {
          this.logger.warn('Browser desconectado, reiniciando...');
          return this.safeRestart();
        }

        // 2. Detectar si estamos logueados
        const loggedIn = await this.page.$('[data-testid="chat-list-search"]');

        if (loggedIn) {
          if (!this.isReady) {
            this.logger.log('Sesión restaurada');
          }
          this.isReady = true;
          return;
        }

        // 3. Detectar si aparece el QR → sesión perdida
        const qrVisible = await this.page.$('[data-testid="qrcode"]');

        if (qrVisible) {
          this.logger.warn('Sesión perdida, QR visible. Regenerando...');
          this.isReady = false;
          return this.safeRestart();
        }

        // 4. Detectar DOM roto (ni chat ni QR)
        const bodyText = await this.page.evaluate(
          () => document.body.innerText,
        );

        if (!loggedIn && !qrVisible && bodyText.length < 50) {
          this.logger.error('DOM roto o vacío. Reiniciando...');
          return this.safeRestart();
        }
      } catch (err) {
        this.logger.error('Error en watcher, reiniciando...', err);
        return this.safeRestart();
      }
    }, 5000); // cada 5 segundos
  }

  private async safeRestart() {
  const now = Date.now();

  if (now - this.lastRestart < this.RESTART_COOLDOWN) {
    this.logger.warn('Reinicio bloqueado por cooldown');
    return;
  }

  this.lastRestart = now;

  try {
    this.logger.log('Reiniciando sesión de WhatsApp...');
    await this.browser?.close().catch(() => {});
  } catch {}

  await this.init();
}


  async init() {
    // 1. Intentar headless
    const headlessSuccess = await this.tryInit(true);

    if (headlessSuccess) {
      this.logger.log('WhatsApp iniciado en headless');
      this.startWatcher();
      return;
    }

    this.logger.warn('Headless falló, intentando con headless: false...');

    // 2. Fallback: modo visible
    const visibleSuccess = await this.tryInit(false);

    if (visibleSuccess) {
      this.logger.log('WhatsApp iniciado en modo visible');
      this.startWatcher();
      return;
    }

    throw new Error('No se pudo inicializar WhatsApp Web en ningún modo');
  }

  private async tryInit(headless: boolean): Promise<boolean> {
    try {
      this.browser = await puppeteer.launch({
        headless: headless ? true : false,
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
        userDataDir: './whatsapp-session',
      });

      this.page = await this.browser.newPage();

      await this.page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      );

      await this.page.goto('https://web.whatsapp.com', {
        waitUntil: 'networkidle2',
      });

      // Esperar un poco para que renderice el QR
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Intentar capturar QR una sola vez
      const qr = await this.captureQR();

      if (!qr) {
        this.logger.warn(`No se pudo capturar QR en headless=${headless}`);
        await this.browser.close();
        return false;
      }

      this.qrBase64 = qr;
      this.isReady = true;
      return true;
    } catch (err) {
      this.logger.error(`Error inicializando headless=${headless}`, err);
      return false;
    }
  }

  private async captureQR(): Promise<string | null> {
    // Intentar canvas en Shadow DOM
    const canvasHandle = await this.findCanvas(this.page);

    if (canvasHandle) {
      try {
        const qr = await canvasHandle.evaluate((node: HTMLCanvasElement) =>
          node.toDataURL(),
        );
        this.logger.log('QR capturado desde canvas');
        return qr;
      } catch {}
    }

    // Fallback: screenshot
    try {
      const qrArea = await this.page.$('canvas, img, svg');
      if (qrArea) {
        const buffer = await qrArea.screenshot();
        const base64 = `data:image/png;base64,${(buffer as Buffer).toString('base64')}`;
        this.logger.log('QR capturado por screenshot fallback');
        return base64;
      }
    } catch {}

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

  getQR() {
    return this.qrBase64;
  }

  async sendMessage(phone: string, message: string) {
    if (!this.isReady) {
      throw new Error('WhatsApp no está listo');
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
