import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class Source {
  @ApiProperty({
    description: 'Идентификатор источника',
    format: 'uuid',
    example: '3f2a8c1e-5b0d-4f7a-9c3e-1d2b4a5c6e7f',
  })
  id!: string;

  @ApiProperty({ description: 'Человекочитаемое имя', example: 'GitHub' })
  name!: string;

  @ApiProperty({
    description: 'Уникальный slug: по нему принимаются входящие вебхуки',
    example: 'github',
  })
  slug!: string;

  @ApiPropertyOptional({
    description:
      'Куда переигрывать события источника. Если не задан — берётся SUBSCRIBER_URL из окружения',
    example: 'http://localhost:5001/deliver',
  })
  subscriberUrl?: string;

  @ApiProperty({
    description: 'Момент создания, ISO 8601',
    example: '2026-07-27T14:00:00.000Z',
  })
  createdAt!: string;
}
