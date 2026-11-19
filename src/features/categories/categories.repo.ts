import { type Ctx, insertRow, softDeleteRow, updateRow, ValidationError } from '@/db/helpers';
import type { SqlDb } from '@/db/adapter';
import type { Bucket, CategorySeed } from '@/presets';

export interface Category {
  id: string;
  parentId: string | null;
  kind: 'expense' | 'income';
  name: string;
  nameKey: string | null;
  icon: string;
  color: string;
  bucket: Bucket | null;
  taxReliefCode: string | null;
  sortOrder: number;
  isHidden: boolean;
  isSystem: boolean;
}

interface Row {
  id: string;
  parent_id: string | null;
  kind: 'expense' | 'income';
  name: string;
  name_key: string | null;
  icon: string;
  color: string;
  bucket: Bucket | null;
  tax_relief_code: string | null;
  sort_order: number;
  is_hidden: number;
  is_system: number;
}

const COLS = 'id, parent_id, kind, name, name_key, icon, color, bucket, tax_relief_code, sort_order, is_hidden, is_system';

const map = (r: Row): Category => ({
  id: r.id,
  parentId: r.parent_id,
  kind: r.kind,
  name: r.name,
  nameKey: r.name_key,
  icon: r.icon,
  color: r.color,
  bucket: r.bucket,
  taxReliefCode: r.tax_relief_code,
  sortOrder: r.sort_order,
  isHidden: r.is_hidden === 1,
  isSystem: r.is_system === 1,
});

export async function listCategories(
  { db, userId }: Ctx,
  opts: { kind?: 'expense' | 'income'; includeHidden?: boolean } = {},
): Promise<Category[]> {
  const where = ['user_id = ?', 'deleted_at IS NULL'];
  const params: (string | number)[] = [userId];
  if (opts.kind) {
    where.push('kind = ?');
    params.push(opts.kind);
  }
  if (!opts.includeHidden) where.push('is_hidden = 0');
  const rows = await db.all<Row>(
    `SELECT ${COLS} FROM categories WHERE ${where.join(' AND ')} ORDER BY kind, sort_order, name`,
    params,
  );
  return rows.map(map);
}

export async function getCategory({ db, userId }: Ctx, id: string): Promise<Category | null> {
  const r = await db.get<Row>(`SELECT ${COLS} FROM categories WHERE id = ? AND user_id = ? AND deleted_at IS NULL`, [id, userId]);
  return r ? map(r) : null;
}

/** Resolves a category name for display: built-in names come from i18n until the user renames them. */
export function categoryLabel(c: Pick<Category, 'name' | 'nameKey'>, t: (key: string) => string): string {
  return c.nameKey ? t(`categories.${c.nameKey}`) : c.name;
}

/** Seed the preset's default categories (idempotent: skips if any exist). */
export async function seedDefaultCategories(ctx: Ctx, seeds: CategorySeed[], englishName: (key: string) => string): Promise<number> {
  return ctx.db.transaction(async (db) => {
    const existing = await db.get<{ n: number }>('SELECT count(*) AS n FROM categories WHERE user_id = ?', [ctx.userId]);
    if ((existing?.n ?? 0) > 0) return 0;
    let count = 0;
    let order = 0;
    for (const s of seeds) {
      const id = await insertSeed(db, ctx.userId, s, s.kind, null, order++);
      count++;
      for (const child of s.children ?? []) {
        await insertSeed(db, ctx.userId, child, s.kind, id, order++);
        count++;
      }
    }
    return count;

    async function insertSeed(
      d: SqlDb,
      userId: string,
      s: Omit<CategorySeed, 'children' | 'kind'>,
      kind: 'expense' | 'income',
      parentId: string | null,
      sortOrder: number,
    ) {
      return insertRow(d, 'categories', {
        user_id: userId,
        parent_id: parentId,
        kind,
        name: englishName(s.key),
        name_key: s.key,
        icon: s.icon,
        color: s.color,
        bucket: kind === 'income' ? null : (s.bucket ?? 'want'),
        tax_relief_code: s.taxReliefCode ?? null,
        sort_order: sortOrder,
        is_system: 1,
      });
    }
  });
}

export interface CategoryInput {
  name: string;
  kind: 'expense' | 'income';
  icon: string;
  color: string;
  bucket: Bucket | null;
  parentId?: string | null;
}

function validate(input: CategoryInput) {
  if (!input.name.trim()) throw new ValidationError('name', 'required');
  if (input.name.trim().length > 40) throw new ValidationError('name', 'too_long');
  if (input.kind === 'expense' && !input.bucket) throw new ValidationError('bucket', 'required');
}

export async function createCategory(ctx: Ctx, input: CategoryInput): Promise<string> {
  validate(input);
  return ctx.db.transaction(async (db) => {
    const max = await db.get<{ m: number | null }>('SELECT max(sort_order) AS m FROM categories WHERE user_id = ?', [ctx.userId]);
    return insertRow(db, 'categories', {
      user_id: ctx.userId,
      parent_id: input.parentId ?? null,
      kind: input.kind,
      name: input.name.trim(),
      name_key: null,
      icon: input.icon,
      color: input.color,
      bucket: input.kind === 'income' ? null : input.bucket,
      sort_order: (max?.m ?? 0) + 1,
    });
  });
}

export async function updateCategory(ctx: Ctx, id: string, input: CategoryInput, nameChanged: boolean): Promise<void> {
  validate(input);
  await updateRow(ctx.db, 'categories', id, {
    name: input.name.trim(),
    // Renaming a built-in category detaches it from the translated default name.
    ...(nameChanged ? { name_key: null } : {}),
    icon: input.icon,
    color: input.color,
    bucket: input.kind === 'income' ? null : input.bucket,
  });
}

export async function setCategoryHidden(ctx: Ctx, id: string, hidden: boolean): Promise<void> {
  await updateRow(ctx.db, 'categories', id, { is_hidden: hidden ? 1 : 0 });
}

/** Persist a new order for the given ids (others keep theirs). */
export async function reorderCategories(ctx: Ctx, orderedIds: string[]): Promise<void> {
  await ctx.db.transaction(async (db) => {
    for (let i = 0; i < orderedIds.length; i++) await updateRow(db, 'categories', orderedIds[i], { sort_order: i });
  });
}

/**
 * Deletes a custom category if unused; otherwise it is hidden so history keeps its label.
 * Built-in categories are only ever hidden.
 */
export async function removeCategory(ctx: Ctx, id: string): Promise<'deleted' | 'hidden'> {
  return ctx.db.transaction(async (db) => {
    const c = await getCategory({ db, userId: ctx.userId }, id);
    if (!c) throw new ValidationError('id', 'not_found');
    const used = await db.get<{ n: number }>(
      `SELECT (SELECT count(*) FROM transactions WHERE category_id = ? AND deleted_at IS NULL)
            + (SELECT count(*) FROM transaction_splits WHERE category_id = ? AND deleted_at IS NULL)
            + (SELECT count(*) FROM categories WHERE parent_id = ? AND deleted_at IS NULL) AS n`,
      [id, id, id],
    );
    if (c.isSystem || (used?.n ?? 0) > 0) {
      await updateRow(db, 'categories', id, { is_hidden: 1 });
      return 'hidden';
    }
    await softDeleteRow(db, 'categories', id);
    return 'deleted';
  });
}
