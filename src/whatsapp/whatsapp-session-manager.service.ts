import { Injectable } from '@nestjs/common';
import { WhatsappSession } from './whatsapp-session.service';

@Injectable()
export class WhatsappSessionManager {
  private sessions = new Map<string, WhatsappSession>();

  getSession(sessionId: string): WhatsappSession {
    let session = this.sessions.get(sessionId);

    if (!session) {
      session = new WhatsappSession(sessionId);
      session.init();
      this.sessions.set(sessionId, session);
    }

    return session; 
  }

  listSessions() {
    return [...this.sessions.keys()];
  }
}
