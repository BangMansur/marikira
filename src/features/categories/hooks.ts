import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useCtx } from '@/stores/session';
import {
  type Category,
  type CategoryInput,
  categoryLabel,
  createCategory,
  listCategories,
  removeCategory,
  reorderCategories,
  setCategoryHidden,
  updateCategory,
} from './categories.repo';

export function useCategories(opts: { kind?: 'expense' | 'income'; includeHidden?: boolean } = {}) {
  const ctx = useCtx();
  return useQuery({ queryKey: ['categories', opts], queryFn: () => listCategories(ctx, opts) });
}

/** id → Category lookup over all categories (including hidden, for history). */
export function useCategoryMap() {
  const { data } = useCategories({ includeHidden: true });
  return useMemo(() => new Map((data ?? []).map((c) => [c.id, c])), [data]);
}

export function useCategoryLabel() {
  const { t } = useTranslation();
  return useCallback((c: Pick<Category, 'name' | 'nameKey'>) => categoryLabel(c, t), [t]);
}

function useInvalidating<A, R>(fn: (a: A) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries() });
}

export function useCreateCategory() {
  const ctx = useCtx();
  return useInvalidating((input: CategoryInput) => createCategory(ctx, input));
}
export function useUpdateCategory() {
  const ctx = useCtx();
  return useInvalidating(({ id, input, nameChanged }: { id: string; input: CategoryInput; nameChanged: boolean }) =>
    updateCategory(ctx, id, input, nameChanged),
  );
}
export function useSetCategoryHidden() {
  const ctx = useCtx();
  return useInvalidating(({ id, hidden }: { id: string; hidden: boolean }) => setCategoryHidden(ctx, id, hidden));
}
export function useReorderCategories() {
  const ctx = useCtx();
  return useInvalidating((ids: string[]) => reorderCategories(ctx, ids));
}
export function useRemoveCategory() {
  const ctx = useCtx();
  return useInvalidating((id: string) => removeCategory(ctx, id));
}
