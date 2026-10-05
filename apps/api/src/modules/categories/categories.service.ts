import { HttpStatus, Injectable, type OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { type CategoryView, ErrorCode } from '@couple-finance/shared';
import { DataSource, type EntityManager, QueryFailedError } from 'typeorm';
import { entityManagerOf } from '../../common/database/typeorm-unit-of-work';
import { type TransactionContext } from '../../common/database/unit-of-work';
import { AppException, validationFailed } from '../../common/errors/app.exception';
import { DomainEvents } from '../../common/events/domain-events';
import { IdGenerator } from '../../common/ids/id-generator';
import { Clock } from '../../common/time/clock';
import { CategoryEntity } from './category.entity';
import { DEFAULT_CATEGORIES } from './default-categories';

const PG_UNIQUE_VIOLATION = '23505';

function isNameTaken(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }
  const driverError: unknown = error.driverError;
  return (
    typeof driverError === 'object' &&
    driverError !== null &&
    'code' in driverError &&
    driverError.code === PG_UNIQUE_VIOLATION
  );
}

const nameTaken = (): AppException =>
  new AppException(
    ErrorCode.CATEGORY_NAME_TAKEN,
    'A category with this name already exists at this level.',
    HttpStatus.CONFLICT,
  );

const categoryNotFound = (): AppException =>
  new AppException(ErrorCode.NOT_FOUND, 'Category not found.', HttpStatus.NOT_FOUND);

export interface CategoryChanges {
  name?: string;
  archived?: boolean;
}

/**
 * Two-level category tree per household (FR-CAT-01..03). Categories are reference data, not
 * financial records: they are archived (never deleted) so history keeps its labels.
 */
@Injectable()
export class CategoriesService implements OnModuleInit {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly events: DomainEvents,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  onModuleInit(): void {
    this.events.subscribe('household.created', (tx, _actor, { householdId }) =>
      this.seedDefaults(tx, householdId),
    );
  }

  private manager(tx?: TransactionContext): EntityManager {
    return tx ? entityManagerOf(tx) : this.dataSource.manager;
  }

  async seedDefaults(tx: TransactionContext, householdId: string): Promise<void> {
    const rows: Partial<CategoryEntity>[] = [];
    for (const [parentName, children] of DEFAULT_CATEGORIES) {
      const parentId = this.ids.next();
      rows.push({ id: parentId, householdId, parentId: null, name: parentName, isSystem: true });
      for (const child of children) {
        rows.push({ id: this.ids.next(), householdId, parentId, name: child, isSystem: true });
      }
    }
    await this.manager(tx).insert(CategoryEntity, rows);
  }

  async list(householdId: string, includeArchived: boolean): Promise<CategoryView[]> {
    const entities = await this.manager().find(CategoryEntity, { where: { householdId } });
    const visible = entities.filter((entity) => includeArchived || entity.archivedAt === null);
    const byName = (a: CategoryEntity, b: CategoryEntity) => a.name.localeCompare(b.name, 'pt-BR');
    const toView = (entity: CategoryEntity, children: CategoryView[]): CategoryView => ({
      id: entity.id,
      name: entity.name,
      parentId: entity.parentId,
      isSystem: entity.isSystem,
      archived: entity.archivedAt !== null,
      children,
    });
    return visible
      .filter((entity) => entity.parentId === null)
      .sort(byName)
      .map((parent) =>
        toView(
          parent,
          visible
            .filter((child) => child.parentId === parent.id)
            .sort(byName)
            .map((child) => toView(child, [])),
        ),
      );
  }

  async create(householdId: string, name: string, parentId: string | null): Promise<CategoryView> {
    if (parentId) {
      const parent = await this.find(householdId, parentId);
      if (!parent || parent.parentId !== null) {
        throw validationFailed([
          {
            field: 'parentId',
            constraints: ['parent must be a top-level category of this household'],
          },
        ]);
      }
      if (parent.archivedAt) {
        throw archived();
      }
    }
    const entity = { id: this.ids.next(), householdId, parentId, name, isSystem: false };
    try {
      await this.manager().insert(CategoryEntity, entity);
    } catch (error) {
      throw isNameTaken(error) ? nameTaken() : error;
    }
    return { ...entity, archived: false, children: [] };
  }

  async update(householdId: string, categoryId: string, changes: CategoryChanges): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const category = await manager.findOne(CategoryEntity, {
        where: { id: categoryId, householdId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!category) {
        throw categoryNotFound();
      }
      const patch: Partial<CategoryEntity> = {};
      if (changes.name !== undefined) {
        patch.name = changes.name;
      }
      if (changes.archived === false && category.archivedAt && category.parentId) {
        const parent = await manager.findOneBy(CategoryEntity, { id: category.parentId });
        if (parent?.archivedAt) {
          throw validationFailed([
            { field: 'archived', constraints: ['restore the parent category first'] },
          ]);
        }
      }
      if (changes.archived !== undefined) {
        patch.archivedAt = changes.archived ? (category.archivedAt ?? this.clock.now()) : null;
      }
      try {
        await manager.update(CategoryEntity, { id: categoryId }, patch);
        if (changes.archived === true && category.parentId === null) {
          // Archiving a category archives its subcategories (they cannot outlive the parent).
          await manager
            .createQueryBuilder()
            .update(CategoryEntity)
            .set({ archivedAt: this.clock.now() })
            .where('parent_id = :categoryId AND archived_at IS NULL', { categoryId })
            .execute();
        }
      } catch (error) {
        throw isNameTaken(error) ? nameTaken() : error;
      }
    });
  }

  /**
   * Public: validates a category for use on a new or edited record (BUSINESS_RULES 25).
   * `allowArchivedId` lets an edit keep the category it already had.
   */
  async assertUsable(
    householdId: string,
    categoryId: string,
    options: { allowArchivedId?: string; tx?: TransactionContext } = {},
  ): Promise<void> {
    const category = await this.find(householdId, categoryId, options.tx);
    if (!category) {
      throw validationFailed([{ field: 'categoryId', constraints: ['unknown category'] }]);
    }
    if (category.archivedAt && category.id !== options.allowArchivedId) {
      throw archived();
    }
  }

  /** Public: the category and its subcategories (category filters, budgets). */
  async subtreeIds(householdId: string, categoryId: string): Promise<string[]> {
    const rows: { id: string }[] = await this.manager().query(
      `SELECT id FROM categories WHERE household_id = $1 AND (id = $2 OR parent_id = $2)`,
      [householdId, categoryId],
    );
    return rows.map((row) => row.id);
  }

  private find(
    householdId: string,
    categoryId: string,
    tx?: TransactionContext,
  ): Promise<CategoryEntity | null> {
    return this.manager(tx).findOneBy(CategoryEntity, { id: categoryId, householdId });
  }
}

function archived(): AppException {
  return new AppException(
    ErrorCode.CATEGORY_ARCHIVED,
    'This category is archived and cannot be used.',
    HttpStatus.UNPROCESSABLE_ENTITY,
  );
}
