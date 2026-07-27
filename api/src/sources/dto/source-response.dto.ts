import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SourceResponseDto {
  @ApiProperty({
    description: 'Идентификатор источника',
    format: 'uuid',
    example: '3f2a8c1e-5b0d-4f7a-9c3e-1d2b4a5c6e7f',
  })
  id!: string;

  @ApiProperty({ description: 'Имя источника', example: 'payments' })
  name!: string;

  @ApiProperty({
    description: 'URL для приёма входящих вебхуков этого источника',
    example:
      'http://localhost:4002/webhooks/3f2a8c1e-5b0d-4f7a-9c3e-1d2b4a5c6e7f',
  })
  ingestUrl!: string;

  @ApiProperty({
    description: 'Задан ли secret у источника. Сам secret API не возвращает',
  })
  hasSecret!: boolean;

  @ApiPropertyOptional({
    description: 'Куда доставляются события источника',
    example: 'http://localhost:5001/deliver',
  })
  subscriberUrl?: string;

  @ApiProperty({
    description: 'Момент создания, ISO 8601',
    example: '2026-07-27T14:00:00.000Z',
  })
  createdAt!: string;
}
