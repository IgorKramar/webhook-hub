import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';

const CODE_BY_STATUS: Record<number, string> = {
  400: 'VALIDATION_ERROR',
  404: 'NOT_FOUND',
  409: 'SLUG_TAKEN',
  502: 'DELIVERY_FAILED',
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const reply = host.switchToHttp().getResponse<FastifyReply>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    reply.status(status).send({
      error: this.extractMessage(exception),
      code: CODE_BY_STATUS[status] ?? 'INTERNAL_ERROR',
    });
  }

  private extractMessage(exception: unknown): string {
    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      if (typeof res === 'string') return res;
      const message = (res as { message?: string | string[] }).message;
      if (Array.isArray(message)) return message.join('; '); // ValidationPipe
      if (message) return message;
    }
    return 'Internal server error';
  }
}
