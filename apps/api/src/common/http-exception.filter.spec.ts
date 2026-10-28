import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
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

  it('passes a machine-readable code through', () => {
    const body = filter.toBody(
      new ConflictException({ message: 'ร้านค้าไม่ร่วมรายการ', code: 'SHOP_NOT_PARTICIPATING' }),
      '/api/x',
    );
    expect(body).toMatchObject({
      statusCode: 409,
      message: 'ร้านค้าไม่ร่วมรายการ',
      code: 'SHOP_NOT_PARTICIPATING',
    });
    expect(body.details).toBeUndefined();
  });

  it('turns validation messages into details', () => {
    const body = filter.toBody(
      new BadRequestException(['phone must be 10 digits', 'amount must be positive']),
      '/api/x',
    );
    expect(body.statusCode).toBe(400);
    expect(body.message).toBe('ข้อมูลไม่ถูกต้อง');
    expect(body.details).toEqual(['phone must be 10 digits', 'amount must be positive']);
  });

  it('translates the "unknown field" message to Thai', () => {
    const body = filter.toBody(
      new BadRequestException(['property confirmPassword should not exist']),
      '/api/x',
    );
    expect(body.details).toEqual(['ไม่รู้จักข้อมูล "confirmPassword"']);
  });

  it('hides internals of unknown errors', () => {
    const body = filter.toBody(new Error('password=secret leaked'), '/api/x');
    expect(body.statusCode).toBe(500);
    expect(body.message).toBe('Internal server error');
    expect(JSON.stringify(body)).not.toContain('secret');
  });
});
