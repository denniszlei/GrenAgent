import { create } from 'zustand';
import type { SessionInfo } from '../lib/types';

interface SessionStore {
  sessions: SessionInfo[];
  activeSessionPath: string | null;
  isLoading: boolean;
  error: string | null;

  setSessions: (sessions: SessionInfo[]) => void;
  setActiveSession: (path: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useSessionStore = create<SessionStore>((set) => ({
  sessions: [],
  activeSessionPath: null,
  isLoading: false,
  error: null,

  setSessions: (sessions) => set({ sessions }),
  setActiveSession: (path) => set({ activeSessionPath: path }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
}));
