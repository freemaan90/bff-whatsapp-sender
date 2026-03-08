// whatsapp.controller.ts
import { Controller, Post, Body, Param, Logger } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { MessagePattern, Payload } from '@nestjs/microservices';

@Controller('whatsapp')
export class WhatsappController {
  private readonly logger = new Logger(WhatsappController.name);

  constructor(private readonly whatsapp: WhatsappService) {}

  @MessagePattern({ cmd: 'whatsapp_sender_qr' })
  async getQR(@Payload() data: { sessionId: string }) {
    const { sessionId } = data;
    this.logger.log('Session ID recibido:', sessionId);
    return this.whatsapp.getQR(sessionId);
  }

  @Post('send/:sessionId')
  send(@Param('sessionId') id: string, @Body() { phone, message }) {
    return this.whatsapp.sendMessage(id, phone, message);
  }
}
