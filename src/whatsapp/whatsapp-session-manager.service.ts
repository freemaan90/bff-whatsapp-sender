import { Injectable, Logger } from '@nestjs/common';
import { WhatsappSession } from './whatsapp-session.service';

@Injectable()
export class WhatsappSessionManager {
  private sessions = new Map<string, WhatsappSession>();
  private readonly logger = new Logger(WhatsappSessionManager.name);

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
    return [...this.sessions.entries()].map(([id, session]) => ({
      sessionId: id,
      isReady: session['isReady'],
      qrBase64: session['qrBase64'],
      hasBrowser: !!session['browser'],
      hasPage: !!session['page'],
    }));
  }

  async deleteSession(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    await session.close();
    this.sessions.delete(sessionId);

    return true;
  }
}
