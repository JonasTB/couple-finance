import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';

/** Generates primary keys in the application (ADR-011). */
export abstract class IdGenerator {
  abstract next(): string;
}

@Injectable()
export class UuidV7IdGenerator extends IdGenerator {
  next(): string {
    return uuidv7();
  }
}
