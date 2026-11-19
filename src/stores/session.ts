import { create } from 'zustand';
import type { Ctx } from '@/db/helpers';

type Status = 'loading' | 'ready' | 'error';

interface SessionState {
  status: Status;
  /** Bumped by reset() so the bootstrap re-runs (e.g. after "delete all data"). */
  epoch: number;
  ctx: Ctx | null;
  errorKind: 'key' | 'encryption' | 'other' | null;
  /** The startup error itself; only ever displayed in Expo Go test mode + __DEV__. */
  error: unknown;
  /** App lock: true while the lock screen must be shown. */
  locked: boolean;
  setReady: (ctx: Ctx) => void;
  setError: (kind: 'key' | 'encryption' | 'other', error?: unknown) => void;
  setLocked: (locked: boolean) => void;
  reset: () => void;
}

export const useSession = create<SessionState>((set) => ({
  status: 'loading',
  epoch: 0,
  ctx: null,
  errorKind: null,
  error: null,
  locked: false,
  setReady: (ctx) => set({ status: 'ready', ctx, errorKind: null, error: null }),
  setError: (errorKind, error = null) => set({ status: 'error', errorKind, error }),
  setLocked: (locked) => set({ locked }),
  reset: () => set((s) => ({ status: 'loading', epoch: s.epoch + 1, ctx: null, errorKind: null, error: null, locked: false })),
}));

/** Repository context for hooks. Only call below the bootstrap gate. */
export function useCtx(): Ctx {
  const ctx = useSession((s) => s.ctx);
  if (!ctx) throw new Error('Database not ready');
  return ctx;
}
