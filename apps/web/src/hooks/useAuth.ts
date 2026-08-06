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

  const login = async (email: string, password: string) => {
    const res = await api.post("/auth/login", { email, password });
    localStorage.setItem("token", res.data.data.accessToken);
    setUser(res.data.data.user);
    return res.data.data;
  };

  const register = async (data: any) => {
    const res = await api.post("/auth/register", data);
    localStorage.setItem("token", res.data.data.accessToken);
    setUser(res.data.data.user);
    return res.data.data;
  };

  const logout = () => { localStorage.removeItem("token"); setUser(null); window.location.href = "/login"; };

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return { user, token, loading, login, register, logout, isAuthenticated: !!user };
}
