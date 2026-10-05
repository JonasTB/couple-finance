import { Body, Controller, Get, HttpStatus, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { ErrorCode } from '@couple-finance/shared';
import { type AuthenticatedUser, CurrentUser } from '../../common/auth/current-user.decorator';
import { AppException } from '../../common/errors/app.exception';
import { UpdateMeDto, UserProfileDto } from './users.dto';
import { UsersService } from './users.service';

@ApiTags('me')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED or TOKEN_EXPIRED' })
@Controller('me')
export class MeController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOkResponse({ type: UserProfileDto })
  async get(@CurrentUser() user: AuthenticatedUser): Promise<UserProfileDto> {
    return this.requireProfile(await this.users.findProfile(user.userId));
  }

  @Patch()
  @ApiOkResponse({ type: UserProfileDto })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: UpdateMeDto,
  ): Promise<UserProfileDto> {
    return this.requireProfile(await this.users.updateDisplayName(user.userId, body.displayName));
  }

  private requireProfile(profile: UserProfileDto | null): UserProfileDto {
    if (!profile) {
      // The guard already checked existence; this covers deletion between guard and handler.
      throw new AppException(
        ErrorCode.UNAUTHENTICATED,
        'Authentication required.',
        HttpStatus.UNAUTHORIZED,
      );
    }
    return profile;
  }
}
