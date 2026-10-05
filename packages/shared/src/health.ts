export type HealthStatus = 'ok' | 'degraded';

export interface HealthResponse {
  status: HealthStatus;
  checks: {
    database: 'up' | 'down';
  };
  /** Instant in ISO-8601 UTC (ADR-003). */
  timestamp: string;
}
