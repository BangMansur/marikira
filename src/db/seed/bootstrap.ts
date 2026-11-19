import type { SqlDb } from '../adapter';
import type { Ctx } from '../helpers';
import { migrate } from '../migrations';
import { seedDefaultCategories } from '@/features/categories/categories.repo';
import { ensureUser, getSettings } from '@/features/settings/settings.repo';
import { getPreset } from '@/presets';

/** Run migrations, make sure the local user exists, seed default categories. */
export async function bootstrapDatabase(db: SqlDb, englishName: (key: string) => string): Promise<Ctx> {
  await migrate(db);
  const userId = await ensureUser(db);
  const ctx = { db, userId };
  const settings = await getSettings(ctx);
  await seedDefaultCategories(ctx, getPreset(settings.presetId).categories, englishName);
  return ctx;
}
