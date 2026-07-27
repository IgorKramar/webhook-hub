import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
} from 'class-validator';

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export class CreateSourceDto {
  @ApiProperty({
    description: 'Человекочитаемое имя источника',
    example: 'GitHub',
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty({ message: 'name не должен быть пустым' })
  @MaxLength(100)
  name!: string;

  @ApiProperty({
    description: 'Уникальный slug для URL приёма вебхуков',
    example: 'github-prod',
    pattern: SLUG_PATTERN.source,
    maxLength: 50,
  })
  @IsString()
  @MaxLength(50)
  @Matches(SLUG_PATTERN, {
    message:
      'slug: строчные латинские буквы, цифры и одиночные дефисы (например, "github-prod")',
  })
  slug!: string;

  @ApiPropertyOptional({
    description:
      'Куда переигрывать события. Если не задан — SUBSCRIBER_URL из окружения',
    example: 'http://localhost:5001/deliver',
  })
  @IsOptional()
  @IsUrl(
    { require_tld: false },
    { message: 'subscriberUrl должен быть валидным URL' },
  )
  subscriberUrl?: string;
}
