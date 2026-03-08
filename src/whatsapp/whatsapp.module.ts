import { Module } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappSessionManager } from './whatsapp-session-manager.service';

@Module({
  providers: [WhatsappService, WhatsappSessionManager],
  controllers: [WhatsappController],
})
export class WhatsappModule {}
