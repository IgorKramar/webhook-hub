import { ApiProperty } from '@nestjs/swagger';
import type { DeliveryStatus } from '../entities/event.entity';

export class DeliveryAttemptResponseDto {
  @ApiProperty({
    description: 'Момент выполнения попытки, ISO 8601',
    example: '2026-07-27T15:42:51.463Z',
  })
  at!: string;

  @ApiProperty({
    description:
      'HTTP-статус ответа подписчика или null для сетевой ошибки и timeout',
    nullable: true,
    example: 200,
  })
  statusCode!: number | null;

  @ApiProperty({
    description: 'Текст ошибки или null для успешной попытки',
    nullable: true,
    example: null,
  })
  error!: string | null;
}

export class DeliveryResponseDto {
  @ApiProperty({
    enum: ['pending', 'delivered', 'failed'],
  })
  status!: DeliveryStatus;

  @ApiProperty({
    type: DeliveryAttemptResponseDto,
    isArray: true,
  })
  attempts!: DeliveryAttemptResponseDto[];

  @ApiProperty({
    description: 'Текст последней ошибки',
    nullable: true,
    example: null,
  })
  lastError!: string | null;
}

export class EventResponseDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Идентификатор события',
  })
  id!: string;

  @ApiProperty({
    format: 'uuid',
    description: 'Идентификатор источника',
  })
  sourceId!: string;

  @ApiProperty({
    description: 'Сохранённые заголовки из whitelist',
    type: 'object',
    additionalProperties: {
      type: 'string',
    },
    example: {
      'content-type': 'application/json',
      'user-agent': 'curl/8.0',
      'x-webhook-secret': '***',
    },
  })
  headers!: Record<string, string>;

  @ApiProperty({
    description: 'Произвольное JSON-тело входящего webhook',
    oneOf: [
      {
        type: 'object',
        additionalProperties: true,
      },
      {
        type: 'array',
        items: {},
      },
    ],
  })
  body!: unknown;

  @ApiProperty({
    description: 'Момент приёма события, ISO 8601',
  })
  receivedAt!: string;

  @ApiProperty({
    type: DeliveryResponseDto,
  })
  delivery!: DeliveryResponseDto;
}

export class EventsPageResponseDto {
  @ApiProperty({
    type: EventResponseDto,
    isArray: true,
  })
  items!: EventResponseDto[];

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({
    description: 'Общее количество событий после применения фильтров',
    example: 42,
  })
  total!: number;
}

export class RetryEventResponseDto {
  @ApiProperty({
    format: 'uuid',
  })
  eventId!: string;

  @ApiProperty({
    enum: ['pending'],
  })
  status!: 'pending';
}
