import { Global, Module } from '@nestjs/common';
import { DomainEvents } from './events/domain-events';
import { IdGenerator, UuidV7IdGenerator } from './ids/id-generator';
import { Clock, SystemClock } from './time/clock';

@Global()
@Module({
  providers: [
    { provide: Clock, useClass: SystemClock },
    { provide: IdGenerator, useClass: UuidV7IdGenerator },
    DomainEvents,
  ],
  exports: [Clock, IdGenerator, DomainEvents],
})
export class CommonModule {}
