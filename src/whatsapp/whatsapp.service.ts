import { Injectable } from '@nestjs/common';
import { WhatsappSessionManager } from './whatsapp-session-manager.service';

@Injectable()
export class WhatsappService {
  constructor(private readonly manager: WhatsappSessionManager) {}

  getQR(sessionId: string) {
    return this.manager.getSession(sessionId).getQR();
  }

  sendMessage(sessionId: string, phone: string, message: string) {
    return this.manager.getSession(sessionId).sendMessage(phone, message);
  }

  listSessions() {
    return this.manager.listSessions();
  }

  createSession(id: string) {
    return this.manager.getSession(id);
  }

  deleteSession(id: string) {
    return this.manager.deleteSession(id);
  }

  getStatus(id: string) {
    return this.manager.getStatus(id);
  }
}
