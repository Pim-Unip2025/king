import { Controller, Get } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Controller('health')
export class HealthController {
  constructor(private readonly db: DatabaseService) {}

  @Get()
  async check() {
    const { rows } = await this.db.query<{ agora: Date }>('SELECT now() AS agora');
    return { status: 'ok', banco: 'ok', agora: rows[0].agora };
  }
}