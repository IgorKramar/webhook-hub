import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { DeliveryService } from '../delivery/delivery.service';
import {
  EventResponseDto,
  EventsPageResponseDto,
  RetryEventResponseDto,
} from './dto/event-response.dto';
import { ListEventsQueryDto } from './dto/list-events-query.dto';
import { EventsService } from './events.service';

@ApiTags('events')
@Controller('api/events')
export class EventsController {
  private readonly logger = new Logger(EventsController.name);

  constructor(
    private readonly eventsService: EventsService,
    private readonly deliveryService: DeliveryService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Получить список событий',
    description: 'События сортируются по receivedAt от новых к старым',
  })
  @ApiOkResponse({ type: EventsPageResponseDto })
  findAll(@Query() query: ListEventsQueryDto): EventsPageResponseDto {
    return this.eventsService.findPage({
      ...(query.sourceId ? { sourceId: query.sourceId } : {}),
      ...(query.status ? { status: query.status } : {}),
      page: query.page,
      limit: query.limit,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Получить событие по id' })
  @ApiOkResponse({ type: EventResponseDto })
  @ApiNotFoundResponse({ description: 'Событие не найдено' })
  findOne(@Param('id') id: string): EventResponseDto {
    return this.eventsService.getByIdOrThrow(id);
  }

  @Post(':id/retry')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Повторить доставку события',
    description:
      'Запускает новую серию до трёх попыток, сохраняя предыдущую историю',
  })
  @ApiAcceptedResponse({ type: RetryEventResponseDto })
  @ApiNotFoundResponse({ description: 'Событие не найдено' })
  retry(@Param('id') id: string): RetryEventResponseDto {
    const event = this.eventsService.getByIdOrThrow(id);

    this.eventsService.markDeliveryPending(event.id);

    void this.deliveryService
      .deliverWithRetries(event.id)
      .catch((error: unknown) => {
        this.logger.error({
          message: 'Unexpected manual retry orchestration error',
          eventId: event.id,
          sourceId: event.sourceId,
          error: this.errorMessage(error),
        });
      });

    return {
      eventId: event.id,
      status: 'pending',
    };
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message || error.name;
    }

    return String(error);
  }
}
