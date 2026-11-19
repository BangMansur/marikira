/** Shared expo-router mock for screen tests. Use with: jest.mock('expo-router', () => require('@/test/mockRouter').routerMock) */
export const routerCalls: { push: unknown[]; back: number; replace: unknown[] } = { push: [], back: 0, replace: [] };
let params: Record<string, string | undefined> = {};

export function setParams(p: Record<string, string | undefined>) {
  params = p;
}

export function resetRouter() {
  routerCalls.push = [];
  routerCalls.back = 0;
  routerCalls.replace = [];
  params = {};
}

const router = {
  push: (to: unknown) => routerCalls.push.push(to),
  replace: (to: unknown) => routerCalls.replace.push(to),
  back: () => {
    routerCalls.back++;
  },
  setParams: (p: Record<string, string | undefined>) => {
    params = { ...params, ...p };
  },
};

export const routerMock = {
  router,
  useRouter: () => router,
  useLocalSearchParams: () => params,
  Redirect: () => null,
  Stack: { Screen: () => null },
};
