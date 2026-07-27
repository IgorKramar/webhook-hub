import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health.controller';
import { EventsModule } from './events/events.module';
import { SourcesModule } from './sources/sources.module';
import { WebhooksModule } from './webhooks/webhooks.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    SourcesModule,
    EventsModule,
    WebhooksModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
