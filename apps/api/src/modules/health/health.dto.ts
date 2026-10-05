import { ApiProperty } from '@nestjs/swagger';
import { type HealthResponse, type HealthStatus } from '@couple-finance/shared';

class HealthChecksDto {
  @ApiProperty({ enum: ['up', 'down'] })
  database!: 'up' | 'down';
}

export class HealthResponseDto implements HealthResponse {
  @ApiProperty({ enum: ['ok', 'degraded'] })
  status!: HealthStatus;

  @ApiProperty({ type: HealthChecksDto })
  checks!: HealthChecksDto;

  @ApiProperty({ example: '2026-10-04T13:05:12.345Z' })
  timestamp!: string;
}
