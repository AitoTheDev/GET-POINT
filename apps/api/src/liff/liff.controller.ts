import { RECEIPT_MAX_FILE_BYTES, RECEIPT_MAX_FILES } from '@getpoint/shared';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators';
import { RegisterDto, SendCodeDto, SessionDto } from './dto';
import { LiffGuard, LineUser } from './liff.guard';
import { LiffService } from './liff.service';
import type { LineProfile } from './line-login.service';

const STRICT = { default: { limit: 10, ttl: 60_000 } };

/**
 * The member app (LINE LIFF). Not for staff: these routes skip the staff login and use the
 * member token from POST /liff/session instead.
 */
@Public()
@Controller('liff')
export class LiffController {
  constructor(private readonly liff: LiffService) {}

  @Get('config')
  config() {
    return this.liff.appConfig();
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('session')
  @HttpCode(200)
  session(@Body() dto: SessionDto) {
    return this.liff.session(dto.idToken);
  }

  @UseGuards(LiffGuard)
  @Get('me')
  me(@LineUser() user: LineProfile) {
    return this.liff.me(user);
  }

  @UseGuards(LiffGuard)
  @Throttle(STRICT)
  @Post('phone-code')
  @HttpCode(200)
  sendCode(@LineUser() user: LineProfile, @Body() dto: SendCodeDto) {
    return this.liff.sendCode(user, dto.phone);
  }

  @UseGuards(LiffGuard)
  @Throttle(STRICT)
  @Post('register')
  register(@LineUser() user: LineProfile, @Body() dto: RegisterDto) {
    return this.liff.register(user, dto);
  }

  /** Multipart `files` (each file is one receipt). Limits are checked again in the service. */
  @UseGuards(LiffGuard)
  @Throttle(STRICT)
  @Post('receipts')
  @UseInterceptors(
    // Room for one file too many, so the member gets the Thai "max 10 files" message.
    FilesInterceptor('files', RECEIPT_MAX_FILES + 1, {
      limits: { fileSize: RECEIPT_MAX_FILE_BYTES, files: RECEIPT_MAX_FILES + 1 },
    }),
  )
  submit(@LineUser() user: LineProfile, @UploadedFiles() files: Express.Multer.File[] = []) {
    return this.liff.submit(
      user,
      files.map((f) => f.buffer),
    );
  }

  @UseGuards(LiffGuard)
  @Get('receipts')
  receipts(@LineUser() user: LineProfile) {
    return this.liff.myReceipts(user);
  }

  @UseGuards(LiffGuard)
  @Get('points')
  points(@LineUser() user: LineProfile) {
    return this.liff.points(user);
  }
}
