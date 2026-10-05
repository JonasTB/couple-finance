import { type CategoryView, ErrorCode } from '@couple-finance/shared';
import { useState } from 'react';
import { useParams } from 'react-router';
import { errorMessage } from '@/shared/api/error-messages';
import { ApiError } from '@/shared/api/http';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { FormAlert } from '@/shared/ui/form-alert';
import { LoadState } from '@/shared/ui/load-state';
import { FormField } from '@/shared/ui/form-field';
import { Input } from '@/shared/ui/input';
import { Select } from '@/shared/ui/select';
import { useCategories, useCategoryMutations } from './ledger-api';

function describeError(error: unknown): string {
  if (error instanceof ApiError && error.code === ErrorCode.CATEGORY_NAME_TAKEN) {
    return 'Já existe uma categoria com esse nome neste nível.';
  }
  if (error instanceof ApiError && error.code === ErrorCode.VALIDATION_FAILED) {
    return 'Não foi possível: para restaurar uma subcategoria, restaure antes a categoria principal.';
  }
  return errorMessage(error instanceof ApiError ? error.code : 'INTERNAL_ERROR');
}

function CategoryRow({
  category,
  onRename,
  onToggle,
}: {
  category: CategoryView;
  onRename: (category: CategoryView) => void;
  onToggle: (category: CategoryView) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-2">
      <span className={category.archived ? 'text-muted-foreground line-through' : ''}>
        {category.name}
      </span>
      <span className="flex gap-1">
        {!category.archived && (
          <Button
            variant="ghost"
            onClick={() => {
              onRename(category);
            }}
          >
            Renomear
          </Button>
        )}
        <Button
          variant="ghost"
          onClick={() => {
            onToggle(category);
          }}
        >
          {category.archived ? 'Restaurar' : 'Arquivar'}
        </Button>
      </span>
    </div>
  );
}

/** Categories are archived, never deleted, so old expenses keep their labels (FR-CAT-02). */
export function CategoriesPage() {
  const { householdId = '' } = useParams();
  const [showArchived, setShowArchived] = useState(false);
  const categories = useCategories(householdId, showArchived);
  const mutations = useCategoryMutations(householdId);
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const [error, setError] = useState<string>();

  const run = async (action: () => Promise<unknown>) => {
    setError(undefined);
    try {
      await action();
    } catch (failure) {
      setError(describeError(failure));
    }
  };

  const onRename = (category: CategoryView) => {
    const next = window.prompt('Novo nome da categoria', category.name)?.trim();
    if (next && next !== category.name) {
      void run(() => mutations.update.mutateAsync({ id: category.id, name: next }));
    }
  };
  const onToggle = (category: CategoryView) => {
    if (
      !category.archived &&
      !window.confirm(`Arquivar “${category.name}”? Despesas antigas continuam com ela.`)
    ) {
      return;
    }
    void run(() => mutations.update.mutateAsync({ id: category.id, archived: !category.archived }));
  };

  return (
    <div className="space-y-6">
      <Card title="Nova categoria">
        <form
          className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim()) return;
            void run(async () => {
              await mutations.create.mutateAsync({
                name: name.trim(),
                ...(parentId ? { parentId } : {}),
              });
              setName('');
            });
          }}
        >
          <FormField label="Nome">
            <Input
              value={name}
              maxLength={40}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          </FormField>
          <FormField label="Dentro de">
            <Select
              value={parentId}
              onChange={(event) => {
                setParentId(event.target.value);
              }}
            >
              <option value="">Nenhuma (categoria principal)</option>
              {(categories.data ?? [])
                .filter((category) => !category.archived)
                .map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
            </Select>
          </FormField>
          <Button type="submit" disabled={mutations.create.isPending}>
            Adicionar
          </Button>
        </form>
      </Card>
      <FormAlert message={error} />
      <LoadState isPending={categories.isPending} error={categories.error} />
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={showArchived}
          onChange={(event) => {
            setShowArchived(event.target.checked);
          }}
        />
        Mostrar arquivadas
      </label>
      <ul className="space-y-3">
        {(categories.data ?? []).map((category) => (
          <li key={category.id} className="rounded-lg border border-border bg-card px-4 py-1">
            <CategoryRow category={category} onRename={onRename} onToggle={onToggle} />
            {category.children.length > 0 && (
              <ul className="mb-2 ml-4 border-l border-border pl-3">
                {category.children.map((child) => (
                  <li key={child.id}>
                    <CategoryRow category={child} onRename={onRename} onToggle={onToggle} />
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
