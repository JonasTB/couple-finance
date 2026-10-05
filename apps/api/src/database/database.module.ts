import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TypeOrmUnitOfWork } from '../common/database/typeorm-unit-of-work';
import { UnitOfWork } from '../common/database/unit-of-work';
import { type Env } from '../config/env';
import { buildDataSourceOptions } from './typeorm-options';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        ...buildDataSourceOptions(config.get('DATABASE_URL', { infer: true }), {
          max: config.get('DATABASE_POOL_MAX', { infer: true }),
        }),
        // Modules register their entities with TypeOrmModule.forFeature.
        entities: [],
        autoLoadEntities: true,
      }),
    }),
  ],
  providers: [{ provide: UnitOfWork, useClass: TypeOrmUnitOfWork }],
  exports: [UnitOfWork],
})
export class DatabaseModule {}
