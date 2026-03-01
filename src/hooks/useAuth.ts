/**
 * useAuth — subscribes to auth state via localStorage events
 */

import { useState, useEffect } from "react";
import { getUser, User } from "@/lib/auth";

export function useAuth(): { user: User | null; loading: boolean } {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setUser(getUser());
    setLoading(false);

    function sync() { setUser(getUser()); }
    window.addEventListener("aia-auth-change", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("aia-auth-change", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return { user, loading };
}
