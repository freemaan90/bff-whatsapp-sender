// whatsapp.controller.ts
import { Controller, Get, Post, Body } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { MessagePattern } from '@nestjs/microservices';

@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly whatsapp: WhatsappService) {}

@MessagePattern({cmd:'whatsapp_sender_qr'})
  async getQR() {
    const qr = this.whatsapp.getQR();
    return { qr };
  }

  @Post('send')
  async send(@Body() dto: { phone: string; message: string }) {
    return this.whatsapp.sendMessage(dto.phone, dto.message);
  }
}
