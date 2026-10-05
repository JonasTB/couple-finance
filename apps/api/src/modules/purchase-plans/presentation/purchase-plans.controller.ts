import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { type Actor, CurrentActor } from '../../../common/auth/current-actor.decorator';
import { UuidParamPipe } from '../../../common/validation/uuid-param.pipe';
import {
  CurrentMember,
  HouseholdMemberGuard,
  type MemberContext,
  RequireHouseholdPermission,
} from '../../households/public';
import { PurchasePlansService } from '../application/purchase-plans.service';
import {
  CreatePurchaseItemDto,
  CreatePurchasePlanDto,
  PurchaseDto,
  PurchasePlanDto,
  UpdatePurchaseItemDto,
  UpdatePurchasePlanDto,
} from './dto/purchase-plans.dto';

/** Purchase plans (FR-PP-01..04). Every item command returns the updated plan. */
@ApiTags('purchase-plans')
@ApiBearerAuth()
@UseGuards(HouseholdMemberGuard)
@Controller('households/:householdId/purchase-plans')
export class PurchasePlansController {
  constructor(private readonly plans: PurchasePlansService) {}

  @Get()
  @RequireHouseholdPermission('household.read')
  @ApiOkResponse({ type: [PurchasePlanDto] })
  list(@CurrentMember() member: MemberContext): Promise<PurchasePlanDto[]> {
    return this.plans.list(member);
  }

  @Post()
  @RequireHouseholdPermission('household.read')
  @ApiCreatedResponse({ type: PurchasePlanDto })
  create(
    @CurrentActor() actor: Actor,
    @CurrentMember() member: MemberContext,
    @Body() body: CreatePurchasePlanDto,
  ): Promise<PurchasePlanDto> {
    return this.plans.create(actor, member, body);
  }

  @Get(':planId')
  @RequireHouseholdPermission('household.read')
  @ApiOkResponse({ type: PurchasePlanDto })
  get(
    @CurrentMember() member: MemberContext,
    @Param('planId', UuidParamPipe) id: string,
  ): Promise<PurchasePlanDto> {
    return this.plans.get(member, id);
  }

  @Patch(':planId')
  @RequireHouseholdPermission('household.read')
  @ApiOkResponse({ type: PurchasePlanDto })
  update(
    @CurrentActor() actor: Actor,
    @CurrentMember() member: MemberContext,
    @Param('planId', UuidParamPipe) id: string,
    @Body() body: UpdatePurchasePlanDto,
  ): Promise<PurchasePlanDto> {
    return this.plans.update(actor, member, id, body);
  }

  @Post(':planId/archive')
  @HttpCode(HttpStatus.OK)
  @RequireHouseholdPermission('household.read')
  @ApiOkResponse({ type: PurchasePlanDto })
  archive(
    @CurrentActor() actor: Actor,
    @CurrentMember() member: MemberContext,
    @Param('planId', UuidParamPipe) id: string,
  ): Promise<PurchasePlanDto> {
    return this.plans.setArchived(actor, member, id, true);
  }

  @Post(':planId/restore')
  @HttpCode(HttpStatus.OK)
  @RequireHouseholdPermission('household.read')
  @ApiOkResponse({ type: PurchasePlanDto })
  restore(
    @CurrentActor() actor: Actor,
    @CurrentMember() member: MemberContext,
    @Param('planId', UuidParamPipe) id: string,
  ): Promise<PurchasePlanDto> {
    return this.plans.setArchived(actor, member, id, false);
  }

  @Post(':planId/items')
  @RequireHouseholdPermission('household.read')
  @ApiCreatedResponse({ type: PurchasePlanDto })
  addItem(
    @CurrentActor() actor: Actor,
    @CurrentMember() member: MemberContext,
    @Param('planId', UuidParamPipe) planId: string,
    @Body() body: CreatePurchaseItemDto,
  ): Promise<PurchasePlanDto> {
    return this.plans.addItem(actor, member, planId, body);
  }

  @Patch(':planId/items/:itemId')
  @RequireHouseholdPermission('household.read')
  @ApiOkResponse({ type: PurchasePlanDto })
  updateItem(
    @CurrentActor() actor: Actor,
    @CurrentMember() member: MemberContext,
    @Param('planId', UuidParamPipe) planId: string,
    @Param('itemId', UuidParamPipe) itemId: string,
    @Body() body: UpdatePurchaseItemDto,
  ): Promise<PurchasePlanDto> {
    return this.plans.updateItem(actor, member, planId, itemId, body);
  }

  @Post(':planId/items/:itemId/purchase')
  @HttpCode(HttpStatus.OK)
  @RequireHouseholdPermission('household.read')
  @ApiOkResponse({ type: PurchasePlanDto })
  purchase(
    @CurrentActor() actor: Actor,
    @CurrentMember() member: MemberContext,
    @Param('planId', UuidParamPipe) planId: string,
    @Param('itemId', UuidParamPipe) itemId: string,
    @Body() body: PurchaseDto,
  ): Promise<PurchasePlanDto> {
    return this.plans.purchase(actor, member, planId, itemId, body);
  }

  @Post(':planId/items/:itemId/unpurchase')
  @HttpCode(HttpStatus.OK)
  @RequireHouseholdPermission('household.read')
  @ApiOkResponse({ type: PurchasePlanDto })
  unpurchase(
    @CurrentActor() actor: Actor,
    @CurrentMember() member: MemberContext,
    @Param('planId', UuidParamPipe) planId: string,
    @Param('itemId', UuidParamPipe) itemId: string,
  ): Promise<PurchasePlanDto> {
    return this.plans.unpurchase(actor, member, planId, itemId);
  }

  @Delete(':planId/items/:itemId')
  @RequireHouseholdPermission('household.read')
  @ApiOkResponse({ type: PurchasePlanDto, description: 'Soft delete' })
  removeItem(
    @CurrentActor() actor: Actor,
    @CurrentMember() member: MemberContext,
    @Param('planId', UuidParamPipe) planId: string,
    @Param('itemId', UuidParamPipe) itemId: string,
  ): Promise<PurchasePlanDto> {
    return this.plans.setItemDeleted(actor, member, planId, itemId, true);
  }

  @Post(':planId/items/:itemId/restore')
  @HttpCode(HttpStatus.OK)
  @RequireHouseholdPermission('household.read')
  @ApiOkResponse({ type: PurchasePlanDto })
  restoreItem(
    @CurrentActor() actor: Actor,
    @CurrentMember() member: MemberContext,
    @Param('planId', UuidParamPipe) planId: string,
    @Param('itemId', UuidParamPipe) itemId: string,
  ): Promise<PurchasePlanDto> {
    return this.plans.setItemDeleted(actor, member, planId, itemId, false);
  }
}
