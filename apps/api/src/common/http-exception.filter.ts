import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/** Every error response from the API has this shape. */
export interface ApiErrorBody {
  statusCode: number;
  error: string;
  message: string;
  details?: string[];
  path: string;
  timestamp: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const body = this.toBody(exception, req.originalUrl ?? req.url);
    if (body.statusCode >= 500) {
      // Log the stack server-side only; the client gets a generic message.
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }
    res.status(body.statusCode).json(body);
  }

  toBody(exception: unknown, path: string): ApiErrorBody {
    const timestamp = new Date().toISOString();

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const response = exception.getResponse();
      let message = exception.message;
      let details: string[] | undefined;

      if (typeof response === 'object' && response !== null) {
        const raw = (response as { message?: unknown }).message;
        // ValidationPipe puts a list of field errors in `message`.
        if (Array.isArray(raw)) {
          message = 'Validation failed';
          details = raw.map(String);
        } else if (typeof raw === 'string') {
          message = raw;
        }
      }

      return {
        statusCode,
        error: HttpStatus[statusCode] ?? 'Error',
        message,
        ...(details && { details }),
        path,
        timestamp,
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error',
      path,
      timestamp,
    };
  }
}
