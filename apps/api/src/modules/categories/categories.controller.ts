import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiProperty,
  ApiPropertyOptional,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CATEGORY_NAME_MAX_LENGTH, type CategoryView } from '@couple-finance/shared';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { trimString } from '../../common/validation/transforms';
import {
  CurrentMember,
  HouseholdMemberGuard,
  type MemberContext,
  RequireHouseholdPermission,
} from '../households/public';
import { CategoriesService } from './categories.service';
import { UuidParamPipe } from '../../common/validation/uuid-param.pipe';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Cuidados com o bebê', maxLength: CATEGORY_NAME_MAX_LENGTH })
  @Transform(trimString)
  @IsString()
  @Length(1, CATEGORY_NAME_MAX_LENGTH)
  name!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Top-level category, for a subcategory' })
  @IsOptional()
  @IsUUID()
  parentId?: string;
}

export class UpdateCategoryDto {
  @ApiPropertyOptional({ maxLength: CATEGORY_NAME_MAX_LENGTH })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @Length(1, CATEGORY_NAME_MAX_LENGTH)
  name?: string;

  @ApiPropertyOptional({ description: 'Archive (true) or restore (false)' })
  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}

class CategoryDto implements CategoryView {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) parentId!: string | null;
  @ApiProperty() isSystem!: boolean;
  @ApiProperty() archived!: boolean;
  @ApiProperty({ type: () => [CategoryDto] }) children!: CategoryDto[];
}

/** Every member may manage categories (ADR-005). */
@ApiTags('categories')
@ApiBearerAuth()
@UseGuards(HouseholdMemberGuard)
@Controller('households/:householdId/categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @RequireHouseholdPermission('household.read')
  @ApiQuery({ name: 'includeArchived', required: false, type: Boolean })
  @ApiOkResponse({ type: [CategoryDto] })
  list(
    @CurrentMember() member: MemberContext,
    @Query('includeArchived') includeArchived?: string,
  ): Promise<CategoryDto[]> {
    return this.categories.list(member.householdId, includeArchived === 'true');
  }

  @Post()
  @RequireHouseholdPermission('household.read')
  @ApiCreatedResponse({ type: CategoryDto })
  @ApiConflictResponse({ description: 'CATEGORY_NAME_TAKEN' })
  create(
    @CurrentMember() member: MemberContext,
    @Body() body: CreateCategoryDto,
  ): Promise<CategoryDto> {
    return this.categories.create(member.householdId, body.name, body.parentId ?? null);
  }

  @Patch(':categoryId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireHouseholdPermission('household.read')
  @ApiNoContentResponse({
    description: 'Rename and/or archive/restore. Archiving a parent archives its children.',
  })
  update(
    @CurrentMember() member: MemberContext,
    @Param('categoryId', UuidParamPipe) categoryId: string,
    @Body() body: UpdateCategoryDto,
  ): Promise<void> {
    return this.categories.update(member.householdId, categoryId, body);
  }
}
