import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { EventsService } from './events.service';

@Module({
  imports: [StorageModule],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
