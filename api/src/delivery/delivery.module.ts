import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { SourcesModule } from '../sources/sources.module';
import { DeliveryService } from './delivery.service';

@Module({
  imports: [EventsModule, SourcesModule],
  providers: [DeliveryService],
  exports: [DeliveryService],
})
export class DeliveryModule {}
