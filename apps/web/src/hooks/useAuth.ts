"use client";
import { useState, useEffect } from "react";
import api from "@/lib/api";

export function useAuth() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { setLoading(false); return; }
    api.get("/auth/me").then((res) => { setUser(res.data.data); setLoading(false); }).catch(() => { localStorage.removeItem("token"); setLoading(false); });
  }, []);

  /**
   * Returns either a completed login, or `{ mfaRequired: true, mfaToken }` when
   * the account has two-factor enabled. In that case nothing is stored yet — the
   * caller must exchange the code via `completeMfa`. Password alone no longer
   * signs anyone in.
   */
  const login = async (email: string, password: string) => {
    const res = await api.post("/auth/login", { email, password });
    const data = res.data.data;
    if (data?.mfaRequired) return data;
    localStorage.setItem("token", data.accessToken);
    setUser(data.user);
    return data;
  };

  const completeMfa = async (mfaToken: string, code: string) => {
    const res = await api.post("/auth/login/mfa", { mfaToken, code });
    const data = res.data.data;
    localStorage.setItem("token", data.accessToken);
    setUser(data.user);
    return data;
  };

  const register = async (data: any) => {
    const res = await api.post("/auth/register", data);
    localStorage.setItem("token", res.data.data.accessToken);
    setUser(res.data.data.user);
    return res.data.data;
  };

  /**
   * Tells the server to drop the session before clearing local state. Logout
   * used to only remove the local copy of the token, which left the token
   * itself valid for anyone who had captured it.
   */
  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // Signing out locally must succeed even if the request does not.
    }
    localStorage.removeItem("token");
    setUser(null);
    window.location.href = "/login";
  };

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return { user, token, loading, login, completeMfa, register, logout, isAuthenticated: !!user };
}
