import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { WhatsappSession } from './whatsapp-session.service';
import { readdir } from 'fs/promises';

@Injectable()
export class WhatsappSessionManager implements OnModuleInit {
  private sessions = new Map<string, WhatsappSession>();
  private readonly logger = new Logger(WhatsappSessionManager.name);
  private readonly sessionsDir = './whatsapp-sessions';

  async onModuleInit() {
    try {
      const entries = await readdir(this.sessionsDir, { withFileTypes: true });
      const sessionIds = entries
        .filter((e) => e.isDirectory())
        .map((e) => e.name);

      this.logger.log(`[STARTUP] Found ${sessionIds.length} session(s) on disk: ${sessionIds.join(', ')}`);

      for (const sessionId of sessionIds) {
        const session = new WhatsappSession(sessionId);
        this.sessions.set(sessionId, session);
        session.init().catch((err) => {
          this.logger.error(`[STARTUP] Failed to init session ${sessionId}: ${err.message}`);
        });
      }
    } catch {
      this.logger.log('[STARTUP] No sessions directory found, starting fresh');
    }
  }

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

  getStatus(sessionId: string) {
    const session = this.sessions.get(sessionId);
    return session ? session.getStatus() : null;
  }
}
