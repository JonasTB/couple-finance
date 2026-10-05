import { Controller, Get, HttpStatus, Res, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { type Response } from 'express';
import { DataSource } from 'typeorm';
import { Public } from '../../common/auth/public.decorator';
import { Clock } from '../../common/time/clock';
import { HealthResponseDto } from './health.dto';

const DATABASE_CHECK_TIMEOUT_MS = 2000;

@ApiTags('health')
@Public()
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly clock: Clock,
  ) {}

  @Get()
  @ApiOkResponse({ type: HealthResponseDto })
  @ApiServiceUnavailableResponse({ type: HealthResponseDto })
  async check(@Res({ passthrough: true }) response: Response): Promise<HealthResponseDto> {
    const databaseUp = await this.isDatabaseUp();
    if (!databaseUp) {
      response.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return {
      status: databaseUp ? 'ok' : 'degraded',
      checks: { database: databaseUp ? 'up' : 'down' },
      timestamp: this.clock.now().toISOString(),
    };
  }

  private async isDatabaseUp(): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<false>((resolve) => {
      timer = setTimeout(() => {
        resolve(false);
      }, DATABASE_CHECK_TIMEOUT_MS);
    });
    const probe = this.dataSource
      .query('SELECT 1')
      .then(() => true)
      .catch(() => false);
    try {
      return await Promise.race([probe, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }
}
