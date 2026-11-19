import { create } from 'zustand';

export interface SnackbarMessage {
  id: number;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface SnackbarState {
  current: SnackbarMessage | null;
  show: (m: Omit<SnackbarMessage, 'id'>) => void;
  dismiss: () => void;
}

let seq = 0;

export const useSnackbar = create<SnackbarState>((set) => ({
  current: null,
  show: (m) => set({ current: { ...m, id: ++seq } }),
  dismiss: () => set({ current: null }),
}));

export const showSnackbar = (m: Omit<SnackbarMessage, 'id'>) => useSnackbar.getState().show(m);
