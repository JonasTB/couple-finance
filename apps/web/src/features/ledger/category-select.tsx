import type { CategoryView } from '@couple-finance/shared';
import type { ComponentProps } from 'react';
import { Select } from '@/shared/ui/select';

/** Two-level category picker: top-level categories group their subcategories. */
export function CategorySelect({
  categories,
  ...props
}: { categories: CategoryView[] } & ComponentProps<'select'>) {
  return (
    <Select {...props}>
      <option value="">Escolha a categoria</option>
      {categories.map((category) =>
        category.children.length > 0 ? (
          <optgroup key={category.id} label={category.name}>
            <option value={category.id}>{category.name} (geral)</option>
            {category.children.map((child) => (
              <option key={child.id} value={child.id}>
                {child.name}
              </option>
            ))}
          </optgroup>
        ) : (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ),
      )}
    </Select>
  );
}
