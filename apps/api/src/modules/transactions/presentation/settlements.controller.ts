import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { type Actor, CurrentActor } from '../../../common/auth/current-actor.decorator';
import { UuidParamPipe } from '../../../common/validation/uuid-param.pipe';
import {
  CurrentMember,
  HouseholdMemberGuard,
  type MemberContext,
  RequireHouseholdPermission,
} from '../../households/public';
import { SettlementsService } from '../application/settlements.service';
import { CreateSettlementDto, ListSettlementsQuery, SettlementDto } from './dto/settlements.dto';

/** Settlements ("acertos", Q-01): out-of-app transfers that only move contribution balances. */
@ApiTags('settlements')
@ApiBearerAuth()
@UseGuards(HouseholdMemberGuard)
@Controller('households/:householdId/settlements')
export class SettlementsController {
  constructor(private readonly settlements: SettlementsService) {}

  @Get()
  @RequireHouseholdPermission('household.read')
  @ApiOkResponse({ type: [SettlementDto], description: 'Newest first, at most 100' })
  list(
    @CurrentMember() member: MemberContext,
    @Query() query: ListSettlementsQuery,
  ): Promise<SettlementDto[]> {
    return this.settlements.list(member, query);
  }

  @Post()
  @RequireHouseholdPermission('household.read')
  @ApiCreatedResponse({ type: SettlementDto })
  create(
    @CurrentActor() actor: Actor,
    @CurrentMember() member: MemberContext,
    @Body() body: CreateSettlementDto,
  ): Promise<SettlementDto> {
    return this.settlements.create(actor, member, body);
  }

  @Delete(':settlementId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireHouseholdPermission('household.read')
  @ApiNoContentResponse({ description: 'Soft delete; restorable' })
  remove(
    @CurrentActor() actor: Actor,
    @CurrentMember() member: MemberContext,
    @Param('settlementId', UuidParamPipe) id: string,
  ): Promise<void> {
    return this.settlements.remove(actor, member, id);
  }

  @Post(':settlementId/restore')
  @HttpCode(HttpStatus.OK)
  @RequireHouseholdPermission('household.read')
  @ApiOkResponse({ type: SettlementDto })
  restore(
    @CurrentActor() actor: Actor,
    @CurrentMember() member: MemberContext,
    @Param('settlementId', UuidParamPipe) id: string,
  ): Promise<SettlementDto> {
    return this.settlements.restore(actor, member, id);
  }
}
