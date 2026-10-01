import { Controller, Get } from '@nestjs/common';
import { sql } from 'kysely';
import { AllowBeforeInstall, AllowIncomplete } from '../common/decorators.js';
import { Db } from '../database/db.service.js';

@Controller('health')
@AllowIncomplete()
@AllowBeforeInstall()
export class HealthController {
  constructor(private readonly db: Db) {}

  @Get()
  async health() {
    await sql`select 1`.execute(this.db.q);
    const mem = process.memoryUsage();
    return {
      status: 'ok',
      db: this.db.driver,
      uptimeSec: Math.round(process.uptime()),
      rssMb: Math.round(mem.rss / 1024 / 1024),
    };
  }
}
