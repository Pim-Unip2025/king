import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { DatabaseService } from '../database/database.service.js';

class HealthDto {
  @ApiProperty({ example: 'ok' })
  status: string;

  @ApiProperty({ example: 'ok' })
  banco: string;

  @ApiProperty({ example: '2026-10-07T02:35:25.061Z' })
  agora: Date;
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly db: DatabaseService) {}

  @Get()
  @ApiOperation({ summary: 'Confere se a API e o banco estão no ar' })
  @ApiOkResponse({ type: HealthDto })
  async check() {
    const { rows } = await this.db.query<{ agora: Date }>('SELECT now() AS agora');
    return { status: 'ok', banco: 'ok', agora: rows[0].agora };
  }
}
