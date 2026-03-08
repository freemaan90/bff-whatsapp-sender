// whatsapp.module.ts
import { Module, OnModuleInit } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';

@Module({
  providers: [WhatsappService],
  controllers: [WhatsappController],
})
export class WhatsappModule implements OnModuleInit {
  constructor(private readonly whatsapp: WhatsappService) {}

  async onModuleInit() {
    await this.whatsapp.init();
  }
}
