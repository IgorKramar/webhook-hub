import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DeliveryModule } from './delivery/delivery.module';
import { EventsModule } from './events/events.module';
import { HealthController } from './health.controller';
import { SourcesModule } from './sources/sources.module';
import { WebhooksModule } from './webhooks/webhooks.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    SourcesModule,
    EventsModule,
    DeliveryModule,
    WebhooksModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
