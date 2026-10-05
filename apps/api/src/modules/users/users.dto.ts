import { ApiProperty } from '@nestjs/swagger';
import { DISPLAY_NAME_MAX_LENGTH, type UserProfile } from '@couple-finance/shared';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';
import { trimString } from '../../common/validation/transforms';

export class UserProfileDto implements UserProfile {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'alex@example.com' })
  email!: string;

  @ApiProperty({ example: 'Alex' })
  displayName!: string;

  @ApiProperty({ example: '2026-10-04T13:05:12.345Z' })
  createdAt!: string;
}

export class UpdateMeDto {
  @ApiProperty({ example: 'Alex', minLength: 1, maxLength: DISPLAY_NAME_MAX_LENGTH })
  @Transform(trimString)
  @IsString()
  @Length(1, DISPLAY_NAME_MAX_LENGTH)
  displayName!: string;
}
