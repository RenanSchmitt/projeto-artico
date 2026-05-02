import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Snowflake, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export default function Layout({ children }: { children: ReactNode }) {
  const nav = useNavigate();
  const { user, role } = useAuth();

  async function logout() {
    await supabase.auth.signOut();
    nav("/auth", { replace: true });
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-card/60 backdrop-blur-sm sticky top-0 z-40">
        <div className="container flex items-center justify-between h-16">
          <button onClick={() => nav("/")} className="flex items-center gap-3">
            <div className="w-9 h-9 rounded bg-primary/10 border border-primary/40 flex items-center justify-center">
              <Snowflake className="text-primary w-5 h-5" />
            </div>
            <div className="text-left">
              <div className="font-bold tracking-wide leading-none">FRIO<span className="text-primary">CTRL</span></div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-widest">Boss Carel · Live</div>
            </div>
          </button>
          <div className="flex items-center gap-4">
            <div className="text-right text-xs hidden sm:block">
              <div className="text-foreground">{user?.email}</div>
              <div className="text-muted-foreground uppercase tracking-widest text-[10px]">
                {role === "admin" ? "Administrador" : "Cliente"}
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={logout}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>
      <main className="container py-8">{children}</main>
    </div>
  );
}
