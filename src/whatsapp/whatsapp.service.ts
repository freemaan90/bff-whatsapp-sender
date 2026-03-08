import { Injectable } from "@nestjs/common";
import { WhatsappSessionManager } from "./whatsapp-session-manager.service";

@Injectable()
export class WhatsappService {
  constructor(private readonly manager: WhatsappSessionManager) {}

  getQR(sessionId: string) {
    return this.manager.getSession(sessionId).getQR();
  }

  sendMessage(sessionId: string, phone: string, message: string) {
    return this.manager.getSession(sessionId).sendMessage(phone, message);
  }
}
