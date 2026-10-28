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
  /** Machine-readable reason for some errors (e.g. why a receipt can't be approved). */
  code?: string;
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
      let code: string | undefined;

      if (typeof response === 'object' && response !== null) {
        const raw = (response as { message?: unknown }).message;
        // ValidationPipe puts a list of field errors in `message`.
        if (Array.isArray(raw)) {
          message = 'ข้อมูลไม่ถูกต้อง';
          details = raw.map((m) =>
            String(m).replace(/^property (\S+) should not exist$/, 'ไม่รู้จักข้อมูล "$1"'),
          );
        } else if (typeof raw === 'string') {
          message = raw;
        }
        // Services may send their own list of field messages, e.g. { message, details: [...] }.
        const rawDetails = (response as { details?: unknown }).details;
        if (!details && Array.isArray(rawDetails)) details = rawDetails.map(String);
        const rawCode = (response as { code?: unknown }).code;
        if (typeof rawCode === 'string') code = rawCode;
      }
      if (statusCode === HttpStatus.PAYLOAD_TOO_LARGE) {
        message = 'ไฟล์มีขนาดเกิน 10 MB';
      }
      if (statusCode === HttpStatus.TOO_MANY_REQUESTS) {
        message = 'มีการเรียกใช้งานบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่';
      }

      return {
        statusCode,
        error: HttpStatus[statusCode] ?? 'Error',
        message,
        ...(details && { details }),
        ...(code && { code }),
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
