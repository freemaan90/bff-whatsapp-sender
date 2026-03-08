// whatsapp.service.ts
import { Injectable, Logger } from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import * as qrcode from 'qrcode';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private browser: puppeteer.Browser;
  private page: puppeteer.Page;
  private qrBase64: string | null = null;
  private isReady = false;

  async init() {
    if (this.browser) return;

this.browser = await puppeteer.launch({
  headless: false, // ← probá así primero
  args: ['--no-sandbox'],
  userDataDir: './whatsapp-session',
});

    this.page = await this.browser.newPage();

    await this.page.goto('https://web.whatsapp.com', {
      waitUntil: 'networkidle2',
    });

    this.logger.log('WhatsApp Web cargado');

    this.detectLoginState();
  }

private async detectLoginState() {
  this.logger.log('Detectando QR una sola vez...');

  // Intentamos encontrar el QR durante 10 segundos
  const maxAttempts = 10;
  let attempts = 0;

  const interval = setInterval(async () => {
    attempts++;

    // 1. Buscar canvas del QR (incluyendo Shadow DOM)
    const canvasHandle = await this.findCanvas(this.page);

    if (canvasHandle) {
      try {
        const qr = await canvasHandle.evaluate((node: HTMLCanvasElement) =>
          node.toDataURL()
        );

        this.qrBase64 = qr;
        this.logger.log('QR capturado desde canvas');
      } catch (e) {
        this.logger.error('Error leyendo QR del canvas', e);
      }

      clearInterval(interval);
      return;
    }

    // 2. Si pasaron 10 intentos → dejamos de buscar
    if (attempts >= maxAttempts) {
      this.logger.warn('No se encontró QR después de varios intentos');
      clearInterval(interval);
    }
  }, 1000);
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
