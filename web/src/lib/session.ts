import { create } from "zustand";
import { persist } from "zustand/middleware";
import { api, ApiError } from "./api";
import type { AuthUser } from "./types";

interface SessionState {
  user: AuthUser | null;
  bootstrapped: boolean;
  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

/**
 * Session persistée (localStorage) : l'utilisateur reste connecté/identifié même
 * hors-ligne. Au boot, on optimise : on pose l'utilisateur persisté immédiatement,
 * puis on rafraîchit via /api/me. Un échec réseau (offline) GARDE la session ;
 * seul un vrai 401/403 (session expirée) la purge.
 */
export const useSession = create<SessionState>()(
  persist(
    (set, get) => ({
      user: null,
      bootstrapped: false,

      async bootstrap() {
        const persisted = get().user;
        // 1) Optimistic : tant qu'on n'a pas de réponse serveur, on garde la
        //    session persistée (utile hors-ligne / au premier paint).
        if (persisted) set({ bootstrapped: true });
        try {
          const user = await api.me();
          set({ user, bootstrapped: true });
        } catch (err) {
          if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
            // 401/403/404 : session réellement expirée/invalide → purge.
            set({ user: null, bootstrapped: true });
          } else if (!persisted) {
            // Jamais connecté et serveur injoignable : pas d'utilisateur.
            set({ user: null, bootstrapped: true });
          } else {
            // Erreur réseau (offline) : on conserve la session persistée.
            set({ bootstrapped: true });
          }
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
        // Purge du cache API PWA (évite les fuites de données entre comptes).
        try {
          await caches.delete("api-cache");
        } catch {
          /* pas de service worker — sans effet */
        }
      },
    }),
    {
      name: "chesscoach-session",
      partialize: (s) => ({ user: s.user }),
    },
  ),
);