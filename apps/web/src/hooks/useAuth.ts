"use client";
import { useState, useEffect } from "react";
import api from "@/lib/api";

/**
 * A presence flag for middleware, which cannot read localStorage.
 *
 * Deliberately NOT the token. It carries no credential and the API never looks
 * at it; it exists only so the server can decide whether to render the app
 * shell or redirect to /login. SameSite=Lax so it is not sent cross-site.
 */
const PRESENCE_COOKIE = "qano-signed-in";

function setSignedInCookie(signedIn: boolean) {
  if (typeof document === "undefined") return;
  document.cookie = signedIn
    ? `${PRESENCE_COOKIE}=1; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`
    : `${PRESENCE_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
}

export function useAuth() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { setSignedInCookie(false); setLoading(false); return; }
    api.get("/auth/me")
      .then((res) => { setUser(res.data.data); setSignedInCookie(true); setLoading(false); })
      .catch(() => { localStorage.removeItem("token"); setSignedInCookie(false); setLoading(false); });
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
    setSignedInCookie(true);
    setUser(data.user);
    return data;
  };

  const completeMfa = async (mfaToken: string, code: string) => {
    const res = await api.post("/auth/login/mfa", { mfaToken, code });
    const data = res.data.data;
    localStorage.setItem("token", data.accessToken);
    setSignedInCookie(true);
    setUser(data.user);
    return data;
  };

  const register = async (data: any) => {
    const res = await api.post("/auth/register", data);
    localStorage.setItem("token", res.data.data.accessToken);
    setSignedInCookie(true);
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
    setSignedInCookie(false);
    setUser(null);
    window.location.href = "/login";
  };

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return { user, token, loading, login, completeMfa, register, logout, isAuthenticated: !!user };
}
