import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditEventEntity } from './audit-event.entity';
import { AuditReader } from './audit-reader';
import { AuditRecorder } from './audit-recorder';

@Module({
  imports: [TypeOrmModule.forFeature([AuditEventEntity])],
  providers: [AuditRecorder, AuditReader],
  exports: [AuditRecorder, AuditReader],
})
export class AuditModule {}
