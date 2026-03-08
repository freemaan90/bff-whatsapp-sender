import { Injectable, Logger } from '@nestjs/common';
import { HealthCheckService, HttpHealthIndicator } from '@nestjs/terminus';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private health: HealthCheckService,
    private http: HttpHealthIndicator,
  ) {}

  async check() {
    const result = await this.health.check([
      () => this.http.pingCheck('google', 'https://google.com', { timeout: 800 }),
    ]);

    this.logger.log(`Health check successful: ${JSON.stringify(result)}`);

    return result;
  }
}
