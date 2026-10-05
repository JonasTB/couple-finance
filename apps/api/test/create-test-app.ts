import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { type App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap/configure-app';
import { Clock } from '../src/common/time/clock';

/** Controllable clock for expiry and grace-window scenarios. */
export class FakeClock extends Clock {
  private current = new Date();

  now(): Date {
    return new Date(this.current);
  }

  set(instant: Date): void {
    this.current = new Date(instant);
  }

  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}

export interface TestAppOptions {
  clock?: Clock;
}

export async function createTestApp(options: TestAppOptions = {}): Promise<INestApplication<App>> {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (options.clock) {
    builder = builder.overrideProvider(Clock).useValue(options.clock);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>({ bufferLogs: true });
  configureApp(app);
  await app.init();
  return app;
}
