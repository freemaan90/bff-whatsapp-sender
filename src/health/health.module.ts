import { Module } from '@nestjs/common';
import { HealthService } from './health.service';
import { HealthController } from './health.controller';
import { TerminusModule } from '@nestjs/terminus';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [HttpModule,TerminusModule], 
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
