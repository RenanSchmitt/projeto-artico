import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Snowflake, LogOut, Thermometer, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export default function Layout({ children }: { children: ReactNode }) {
  const nav = useNavigate();
  const { user, role } = useAuth();

  async function logout() {
    await supabase.auth.signOut();
    nav("/auth", { replace: true });
  }

  // 🔐 Condição para saber se o usuário logado é Administrador
  const isAdmin = role === "admin" || user?.email === "admin@admin.com";

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-card/60 backdrop-blur-sm sticky top-0 z-40">
        <div className="container flex items-center justify-between h-16">
          
          {/* LADO ESQUERDO: LOGO E BOTÕES DE ADM */}
          <div className="flex items-center gap-6">
            <button onClick={() => nav("/")} className="flex items-center gap-3">
              <div className="w-9 h-9 rounded bg-primary/10 border border-primary/40 flex items-center justify-center">
                <Snowflake className="text-primary w-5 h-5" />
              </div>
              <div className="text-left">
                <div className="font-bold tracking-wide leading-none">FRIO<span className="text-primary">CTRL</span></div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-widest">Boss Carel · Live</div>
              </div>
            </button>

            {/* 🚀 LINKS EXCLUSIVOS DO ADMINISTRADOR */}
            {isAdmin && (
              <nav className="hidden md:flex items-center gap-2 border-l border-border pl-6">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => nav("/admin")}
                  className="text-xs font-semibold gap-1.5 h-8 text-muted-foreground hover:text-foreground"
                >
                  <Thermometer className="w-3.5 h-3.5 text-primary" />
                  Gerenciar Câmaras
                </Button>

                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => nav("/admin/users")}
                  className="text-xs font-semibold gap-1.5 h-8 text-muted-foreground hover:text-foreground"
                >
                  <Users className="w-3.5 h-3.5 text-blue-500" />
                  Criar Usuários (Clientes)
                </Button>
              </nav>
            )}
          </div>

          {/* LADO DIREITO: INFORMAÇÕES DE CONTA E LOGOUT */}
          <div className="flex items-center gap-4">
            <div className="text-right text-xs hidden sm:block">
              <div className="text-foreground">{user?.email}</div>
              <div className="text-muted-foreground uppercase tracking-widest text-[10px]">
                {isAdmin ? "Administrador" : "Cliente"}
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