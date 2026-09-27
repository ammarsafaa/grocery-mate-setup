import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { PosUser } from "./types";
import { getUsers, getSessionUserId, setSessionUserId } from "./db";

interface AuthCtx {
  user: PosUser | null;
  login: (pin: string) => boolean;
  logout: () => void;
}

const Ctx = createContext<AuthCtx>({
  user: null,
  login: () => false,
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PosUser | null>(null);

  useEffect(() => {
    const id = getSessionUserId();
    if (id) {
      const u = getUsers().find((x) => x.id === id && x.active);
      if (u) setUser(u);
    }
  }, []);

  const login = (pin: string) => {
    const u = getUsers().find((x) => x.pin === pin && x.active);
    if (u) {
      setUser(u);
      setSessionUserId(u.id);
      return true;
    }
    return false;
  };

  const logout = () => {
    setUser(null);
    setSessionUserId(null);
  };

  return <Ctx.Provider value={{ user, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  return useContext(Ctx);
}
