import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { SourcesModule } from '../sources/sources.module';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [SourcesModule, EventsModule],
  controllers: [WebhooksController],
  providers: [WebhooksService],
})
export class WebhooksModule {}
