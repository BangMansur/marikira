import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCtx } from '@/stores/session';
import type { TransactionInput } from './rules';
import {
  createTransaction,
  deleteTransaction,
  findMerchantCategory,
  getTransaction,
  lastUsedAccountId,
  listTransactions,
  restoreTransactions,
  searchMerchants,
  suggestCategories,
  type TransactionFilter,
  updateTransaction,
} from './transactions.repo';

const PAGE = 50;

export function useTransactionPages(filter: Omit<TransactionFilter, 'limit' | 'offset'>) {
  const ctx = useCtx();
  return useInfiniteQuery({
    queryKey: ['transactions', filter],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => listTransactions(ctx, { ...filter, limit: PAGE, offset: pageParam }),
    getNextPageParam: (last, all) => (last.length < PAGE ? undefined : all.length * PAGE),
  });
}

export function useTransaction(id: string | undefined) {
  const ctx = useCtx();
  return useQuery({ queryKey: ['transaction', id], queryFn: () => getTransaction(ctx, id!), enabled: !!id });
}

export function useLastAccountId() {
  const ctx = useCtx();
  return useQuery({ queryKey: ['lastAccount'], queryFn: () => lastUsedAccountId(ctx) });
}

export function useCategorySuggestions(kind: 'expense' | 'income', merchantName: string) {
  const ctx = useCtx();
  const hour = new Date().getHours();
  return useQuery({
    queryKey: ['suggestions', kind, hour, merchantName.trim().toLowerCase()],
    queryFn: () => suggestCategories(ctx, { kind, hour, merchantName, limit: 7 }),
    placeholderData: (prev) => prev,
  });
}

/** The category this merchant was last saved under (merchant learning), or null. */
export function useMerchantCategory(merchantName: string) {
  const ctx = useCtx();
  return useQuery({
    queryKey: ['merchantCategory', merchantName.trim().toLowerCase()],
    queryFn: () => findMerchantCategory(ctx, merchantName),
    enabled: merchantName.trim().length > 0,
  });
}

export function useMerchantSearch(prefix: string) {
  const ctx = useCtx();
  return useQuery({
    queryKey: ['merchants', prefix.trim().toLowerCase()],
    queryFn: () => searchMerchants(ctx, prefix),
    enabled: prefix.trim().length >= 2,
  });
}

function useLedgerMutation<A, R>(fn: (a: A) => Promise<R>) {
  const qc = useQueryClient();
  // Deleting/adding a transaction must update balances, budgets and reports instantly.
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries() });
}

export function useCreateTransaction() {
  const ctx = useCtx();
  return useLedgerMutation((input: TransactionInput) => createTransaction(ctx, input));
}
export function useUpdateTransaction() {
  const ctx = useCtx();
  return useLedgerMutation(({ id, input }: { id: string; input: TransactionInput }) => updateTransaction(ctx, id, input));
}
export function useDeleteTransaction() {
  const ctx = useCtx();
  return useLedgerMutation((id: string) => deleteTransaction(ctx, id));
}
export function useRestoreTransactions() {
  const ctx = useCtx();
  return useLedgerMutation((ids: string[]) => restoreTransactions(ctx, ids));
}
