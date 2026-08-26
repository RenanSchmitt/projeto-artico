import { useEffect, useState } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "client";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setUser(s?.user ?? null);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    // Nunca reutiliza papel ou tenant da sessão anterior.
    setRole(null);
    setTenantId(null);

    if (!user) {
      return;
    }

    let cancelled = false;
    (async () => {
      const [{ data: roles }, { data: profile }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", user.id),
        supabase.from("profiles").select("tenant_id").eq("id", user.id).maybeSingle(),
      ]);
      if (cancelled) return;
      // Uma conta vinculada a uma empresa sempre opera como cliente.
      // Somente administradores sem tenant têm acesso global.
      const isAdmin = roles?.some((r) => r.role === "admin") && !profile?.tenant_id;
      setRole(isAdmin ? "admin" : "client");
      setTenantId(profile?.tenant_id ?? null);
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return { session, user, role, tenantId, loading };
}
