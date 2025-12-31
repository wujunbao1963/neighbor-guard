import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  async health() {
    try {
      await this.healthService.checkDb();
      return { ok: true, db: 'up' };
    } catch (e: any) {
      return { ok: false, db: 'down', error: e?.message ?? 'unknown' };
    }
  }
}
