import { Injectable } from '@nestjs/common';

/** Source of "now". Injected so tests control time (ADR-003). */
export abstract class Clock {
  abstract now(): Date;
}

@Injectable()
export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }
}
