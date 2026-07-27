import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DeliveryModule } from './delivery/delivery.module';
import { EventsController } from './events/events.controller';
import { EventsModule } from './events/events.module';
import { HealthController } from './health.controller';
import { SourcesModule } from './sources/sources.module';
import { StorageModule } from './storage/storage.module';
import { WebhooksModule } from './webhooks/webhooks.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    StorageModule,
    SourcesModule,
    EventsModule,
    DeliveryModule,
    WebhooksModule,
  ],
  controllers: [HealthController, EventsController],
})
export class AppModule {}
