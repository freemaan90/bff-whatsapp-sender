// whatsapp.controller.ts
import { Controller, Post, Body, Param, Logger } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { MessagePattern, Payload } from '@nestjs/microservices';

@Controller('whatsapp')
export class WhatsappController {
  private readonly logger = new Logger(WhatsappController.name);

  constructor(private readonly whatsapp: WhatsappService) {}

  @MessagePattern({ cmd: 'whatsapp_sender_qr' })
  async getQR(@Payload() data: any) {
    const sessionId = data.sessionId ?? data; // soporta ambos formatos
    this.logger.log(`Session ID recibido: ${sessionId}`);
    return this.whatsapp.getQR(String(sessionId));
  }

  @MessagePattern({ cmd: 'whatsapp_sender_sessions' })
  list() {
    return this.whatsapp.listSessions();
  }

  @MessagePattern({ cmd: 'whatsapp_sender_delete_session' })
  delete(@Payload() data: { sessionId: string }) {
    const { sessionId } = data;
    return this.whatsapp.deleteSession(sessionId);
  }

  @MessagePattern({ cmd: 'whatsapp_sender_create_session' })
  create(@Payload() data: any) {
    const sessionId = data.sessionId ?? data; // soporta ambos formatos
    this.logger.log(`Session ID recibido: ${sessionId}`);
    return this.whatsapp.createSession(sessionId);
  }

  @MessagePattern({ cmd: 'whatsapp_sender_session_status' })
  getStatus(@Payload() data: {sessionId:string}) {
    const { sessionId } = data;
    return this.whatsapp.getStatus(sessionId);
  }

  @Post('send/:sessionId')
  send(@Param('sessionId') id: string, @Body() { phone, message }) {
    return this.whatsapp.sendMessage(id, phone, message);
  }
}
