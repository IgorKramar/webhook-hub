import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export const EVENT_STATUS_FILTERS = [
  'received',
  'pending',
  'delivered',
  'failed',
] as const;

export type EventStatusFilter = (typeof EVENT_STATUS_FILTERS)[number];

export class ListEventsQueryDto {
  @ApiPropertyOptional({
    description:
      'Фильтр по статусу. received — pending-событие без попыток доставки',
    enum: EVENT_STATUS_FILTERS,
  })
  @IsOptional()
  @IsUUID()
  sourceId?: string;

  @ApiPropertyOptional({
    description:
      'Фильтр по статусу. received в текущей модели эквивалентен pending',
    enum: EVENT_STATUS_FILTERS,
  })
  @IsOptional()
  @IsIn(EVENT_STATUS_FILTERS)
  status?: EventStatusFilter;

  @ApiPropertyOptional({
    description: 'Номер страницы',
    minimum: 1,
    default: 1,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({
    description: 'Количество событий на странице',
    minimum: 1,
    maximum: 100,
    default: 20,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}
