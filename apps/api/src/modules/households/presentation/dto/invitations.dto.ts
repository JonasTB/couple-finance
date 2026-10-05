import { ApiProperty } from '@nestjs/swagger';
import {
  type AcceptedInvitation,
  type CreatedInvitation,
  type HouseholdInvitationView,
  type InvitationPreview,
  type InvitationStatus,
} from '@couple-finance/shared';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Matches, MaxLength } from 'class-validator';
import { normalizeEmail } from '../../../../common/validation/transforms';

export class CreateInvitationDto {
  @ApiProperty({ example: 'bruno@example.com' })
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

export class InvitationTokenDto {
  @ApiProperty({ description: 'Token from the invitation link (never logged, never stored raw)' })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{32,64}$/)
  token!: string;
}

export class InvitationDto implements HouseholdInvitationView {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ enum: ['PENDING', 'EXPIRED'] }) status!: InvitationStatus;
  @ApiProperty() expiresAt!: string;
  @ApiProperty() createdAt!: string;
}

export class CreatedInvitationDto implements CreatedInvitation {
  @ApiProperty({ type: InvitationDto }) invitation!: InvitationDto;
  @ApiProperty({ description: 'Shown once. The web app builds the link /convite#t=<token>.' })
  token!: string;
}

export class InvitationPreviewDto implements InvitationPreview {
  @ApiProperty() householdName!: string;
  @ApiProperty() inviterDisplayName!: string;
  @ApiProperty({ example: 'b****@example.com' }) emailHint!: string;
  @ApiProperty() expiresAt!: string;
}

export class AcceptedInvitationDto implements AcceptedInvitation {
  @ApiProperty({ format: 'uuid' }) householdId!: string;
}
