import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBody,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { WebhooksService } from './webhooks.service';

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post(':sourceId')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Принять входящий вебхук' })
  @ApiBody({ description: 'Произвольный JSON: объект или массив' })
  @ApiHeader({ name: 'X-Webhook-Secret', required: false })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Повтор с тем же ключом вернёт тот же eventId',
  })
  @ApiAcceptedResponse({
    schema: {
      example: { eventId: '3f2a8c1e-...', status: 'received' },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Неверный X-Webhook-Secret' })
  @ApiNotFoundResponse({ description: 'Источник не найден' })
  ingest(
    @Param('sourceId') sourceId: string,
    @Body() body: unknown,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ): { eventId: string; status: 'received' } {
    return this.webhooksService.ingest(sourceId, body, headers);
  }
}
