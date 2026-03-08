import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';

@Module({
  imports: [HealthModule, WhatsappModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
