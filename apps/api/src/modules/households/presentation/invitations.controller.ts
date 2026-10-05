import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import { type Actor, CurrentActor } from '../../../common/auth/current-actor.decorator';
import { Public } from '../../../common/auth/public.decorator';
import { InvitationsService } from '../application/invitations.service';
import {
  AcceptedInvitationDto,
  InvitationPreviewDto,
  InvitationTokenDto,
} from './dto/invitations.dto';

/** Token-based endpoints; tokens travel in the body (never in URLs or logs). */
@ApiTags('invitations')
@ApiUnprocessableEntityResponse({ description: 'INVITATION_INVALID' })
@ApiTooManyRequestsResponse({ description: 'RATE_LIMITED' })
@UseGuards(ThrottlerGuard)
@SkipThrottle({ email: true, api: true })
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Post('preview')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: InvitationPreviewDto })
  preview(@Body() body: InvitationTokenDto): Promise<InvitationPreviewDto> {
    return this.invitations.preview(body.token);
  }

  @Post('accept')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOkResponse({ type: AcceptedInvitationDto })
  @ApiForbiddenResponse({ description: 'INVITATION_EMAIL_MISMATCH' })
  @ApiConflictResponse({ description: 'HOUSEHOLD_FULL or ALREADY_MEMBER' })
  accept(
    @CurrentActor() actor: Actor,
    @Body() body: InvitationTokenDto,
  ): Promise<AcceptedInvitationDto> {
    return this.invitations.accept(actor, body.token);
  }
}
