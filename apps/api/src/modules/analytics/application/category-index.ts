import { type CategoryView } from '@couple-finance/shared';
import { type CategoryInfo } from '../domain/contribution';

/** Any category id (top-level or sub) → its top-level category, archived ones included. */
export function topLevelIndex(tree: CategoryView[]): Map<string, CategoryInfo> {
  const index = new Map<string, CategoryInfo>();
  for (const parent of tree) {
    const info = { topLevelId: parent.id, topLevelName: parent.name };
    index.set(parent.id, info);
    for (const child of parent.children) {
      index.set(child.id, info);
    }
  }
  return index;
}
