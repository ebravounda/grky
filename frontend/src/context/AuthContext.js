import { createContext, useContext, useEffect, useState, useCallback } from "react";
import api from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null=checking, false=guest, obj=auth
  const [access, setAccess] = useState(null); // {role, permissions, commissionPerSim}
  const [loading, setLoading] = useState(true);

  const loadAccess = useCallback(async (u) => {
    if (u && u.role && u.role !== "client") {
      try { const { data } = await api.get("/access/me"); setAccess(data); }
      catch (e) { setAccess({ role: u.role, permissions: [] }); }
    } else {
      setAccess(null);
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("goroky_token");
    if (!token) { setUser(false); setLoading(false); return; }
    api.get("/auth/me")
      .then(async (r) => { setUser(r.data); await loadAccess(r.data); })
      .catch(() => { localStorage.removeItem("goroky_token"); setUser(false); })
      .finally(() => setLoading(false));
  }, [loadAccess]);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem("goroky_token", data.token);
    setUser(data.user);
    await loadAccess(data.user);
    return data.user;
  };

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch (e) {}
    localStorage.removeItem("goroky_token");
    setUser(false); setAccess(null);
  };

  const hasPerm = (p) => {
    if (!user) return false;
    if (user.role === "admin") return true;
    return (access?.permissions || []).includes(p);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, access, loading, login, logout, hasPerm }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
