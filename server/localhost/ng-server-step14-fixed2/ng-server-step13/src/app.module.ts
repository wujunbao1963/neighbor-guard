import { TopoMapModule } from './topomap/topomap.module';
import { Module, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { CirclesModule } from './circles/circles.module';
import { EdgeDevicesModule } from './edge-devices/edge-devices.module';
import { DeviceAuthModule } from './device-auth/device-auth.module';
import { EventsIngestModule } from './events-ingest/events-ingest.module';
import { EventsReadModule } from './events-read/events-read.module';
import { EventsCollabModule } from './events-collab/events-collab.module';
import { EvidenceModule } from './evidence/evidence.module';
import { NgExceptionFilter } from './common/errors/ng-exception.filter';

@Module({
  imports: [TopoMapModule, 
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const dbUrl = config.get<string>('DATABASE_URL');
        if (!dbUrl) {
          throw new Error('DATABASE_URL is required (set it in .env)');
        }

        const sslEnabled = (config.get<string>('DB_SSL') ?? 'true') === 'true';
        const rejectUnauthorized = (config.get<string>('DB_SSL_REJECT_UNAUTHORIZED') ?? 'false') !== 'false';

        return {
          type: 'postgres',
          url: dbUrl,

          // Step 0: do not mutate remote DB
          synchronize: false,
          migrationsRun: false,

          // Step 2: enable entities (still no DB mutation because synchronize=false)
          autoLoadEntities: true,

          logging: ['error'],
          ssl: sslEnabled ? { rejectUnauthorized } : false,
        };
      },
    }),

    HealthModule,
    AuthModule,
    CirclesModule,
    EdgeDevicesModule,
    DeviceAuthModule,
    EventsIngestModule,
    EventsReadModule,
    EventsCollabModule,
    EvidenceModule,
  ],
  providers: [
    // Ensure contract-aligned error envelope and request validation are active
    // in BOTH normal bootstrap (main.ts) and e2e tests (which don't run main.ts).
    { provide: APP_FILTER, useClass: NgExceptionFilter },
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    },
  ],
})
export class AppModule {}
