import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Length,
} from 'class-validator';

export class CreateSourceDto {
  @ApiProperty({
    description: 'Имя источника',
    example: 'payments',
    minLength: 1,
    maxLength: 64,
  })
  @IsString()
  @Length(1, 64, { message: 'name: строка от 1 до 64 символов' })
  name!: string;

  @ApiPropertyOptional({
    description:
      'Shared secret для проверки входящих вебхуков (заголовок X-Webhook-Secret). В ответах API никогда не возвращается',
    example: 's3cret',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  secret?: string;

  @ApiPropertyOptional({
    description:
      'Куда доставлять события. Если не задан — используется SUBSCRIBER_URL из окружения',
    example: 'http://localhost:5001/deliver',
  })
  @IsOptional()
  @IsUrl(
    { require_tld: false },
    { message: 'subscriberUrl должен быть валидным URL' },
  )
  subscriberUrl?: string;
}
