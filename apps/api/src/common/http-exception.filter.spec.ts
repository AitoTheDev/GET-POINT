import { BadRequestException, NotFoundException } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  const filter = new HttpExceptionFilter();

  it('maps HttpException to the standard body', () => {
    const body = filter.toBody(new NotFoundException('Shop not found'), '/api/shops/1');
    expect(body).toMatchObject({
      statusCode: 404,
      error: 'NOT_FOUND',
      message: 'Shop not found',
      path: '/api/shops/1',
    });
    expect(body.details).toBeUndefined();
  });

  it('turns validation messages into details', () => {
    const body = filter.toBody(
      new BadRequestException(['phone must be 10 digits', 'amount must be positive']),
      '/api/x',
    );
    expect(body.statusCode).toBe(400);
    expect(body.message).toBe('Validation failed');
    expect(body.details).toEqual(['phone must be 10 digits', 'amount must be positive']);
  });

  it('hides internals of unknown errors', () => {
    const body = filter.toBody(new Error('password=secret leaked'), '/api/x');
    expect(body.statusCode).toBe(500);
    expect(body.message).toBe('Internal server error');
    expect(JSON.stringify(body)).not.toContain('secret');
  });
});
