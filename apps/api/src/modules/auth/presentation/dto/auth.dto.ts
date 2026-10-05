import { ApiProperty } from '@nestjs/swagger';
import {
  type AuthSession,
  DISPLAY_NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '@couple-finance/shared';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, MaxLength } from 'class-validator';
import { normalizeEmail, trimString } from '../../../../common/validation/transforms';
import { UserProfileDto } from '../../../users/public';

const EMAIL_MAX_LENGTH = 254;

export class RegisterDto {
  @ApiProperty({ example: 'alex@example.com', maxLength: EMAIL_MAX_LENGTH })
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(EMAIL_MAX_LENGTH)
  email!: string;

  @ApiProperty({
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
    description: 'Not trimmed. Common passwords and passwords containing the email are rejected.',
  })
  @IsString()
  @Length(PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH)
  password!: string;

  @ApiProperty({ example: 'Alex', minLength: 1, maxLength: DISPLAY_NAME_MAX_LENGTH })
  @Transform(trimString)
  @IsString()
  @Length(1, DISPLAY_NAME_MAX_LENGTH)
  displayName!: string;
}

export class LoginDto {
  @ApiProperty({ example: 'alex@example.com' })
  @Transform(normalizeEmail)
  @IsString()
  @MaxLength(EMAIL_MAX_LENGTH)
  email!: string;

  @ApiProperty()
  @IsString()
  @Length(1, PASSWORD_MAX_LENGTH)
  password!: string;
}

export class AuthSessionDto implements AuthSession {
  @ApiProperty({ description: 'Bearer token for the Authorization header. Keep in memory only.' })
  accessToken!: string;

  @ApiProperty({ example: '2026-10-04T13:20:12.000Z' })
  accessTokenExpiresAt!: string;

  @ApiProperty({ type: UserProfileDto })
  user!: UserProfileDto;
}
