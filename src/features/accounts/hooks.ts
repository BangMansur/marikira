import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCtx } from '@/stores/session';
import {
  type AccountInput,
  adjustBalance,
  createAccount,
  getAccount,
  listAccounts,
  setAccountArchived,
  updateAccount,
} from './accounts.repo';

export function useAccounts(opts: { includeArchived?: boolean } = {}) {
  const ctx = useCtx();
  return useQuery({ queryKey: ['accounts', opts], queryFn: () => listAccounts(ctx, opts) });
}

export function useAccount(id: string | undefined) {
  const ctx = useCtx();
  return useQuery({ queryKey: ['account', id], queryFn: () => getAccount(ctx, id!), enabled: !!id });
}

/** Every ledger change can move every figure, so mutations refresh all derived queries. */
function useLedgerMutation<A, R>(fn: (args: A) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries() });
}

export function useCreateAccount() {
  const ctx = useCtx();
  return useLedgerMutation((input: AccountInput) => createAccount(ctx, input));
}

export function useUpdateAccount() {
  const ctx = useCtx();
  return useLedgerMutation(({ id, input }: { id: string; input: Omit<AccountInput, 'openingBalance' | 'currency'> }) =>
    updateAccount(ctx, id, input),
  );
}

export function useArchiveAccount() {
  const ctx = useCtx();
  return useLedgerMutation(({ id, archived }: { id: string; archived: boolean }) => setAccountArchived(ctx, id, archived));
}

export function useAdjustBalance() {
  const ctx = useCtx();
  return useLedgerMutation(({ id, balance, note }: { id: string; balance: number; note: string | null }) =>
    adjustBalance(ctx, id, balance, note),
  );
}
