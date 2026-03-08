// whatsapp.module.ts
import { Module, OnModuleInit } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';
import { promises as fs } from 'fs';
import * as path from 'path';

@Module({
  providers: [WhatsappService],
  controllers: [WhatsappController],
})
export class WhatsappModule implements OnModuleInit {
  constructor(private readonly whatsapp: WhatsappService) {}

  async onModuleInit() {
    // 1. Borrar sesión previa
    const folderPath = path.join(process.cwd(), 'whatsapp-session');
    await fs.rm(folderPath, { recursive: true, force: true });

    // 2. Inicializar WhatsApp
    await this.whatsapp.init();
  }
}
