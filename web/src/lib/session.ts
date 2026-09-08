import { create } from "zustand";
import { api } from "./api";
import type { AuthUser } from "./types";

interface SessionState {
  user: AuthUser | null;
  bootstrapped: boolean;
  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useSession = create<SessionState>((set) => ({
  user: null,
  bootstrapped: false,

  async bootstrap() {
    try {
      const user = await api.me();
      set({ user, bootstrapped: true });
    } catch {
      set({ user: null, bootstrapped: true });
    }
  },

  async login(email, password) {
    await api.login(email, password);
    const user = await api.me();
    set({ user });
  },

  async logout() {
    try {
      await api.logout();
    } catch {
      /* on nettoie l'état local même si le cookie a expiré */
    }
    set({ user: null });
  },
}));