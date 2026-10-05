export const CATEGORY_NAME_MAX_LENGTH = 40;

export interface CategoryView {
  id: string;
  name: string;
  parentId: string | null;
  isSystem: boolean;
  archived: boolean;
  /** Subcategories (top-level categories only; at most two levels). */
  children: CategoryView[];
}
