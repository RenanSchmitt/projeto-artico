import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Snowflake, LogOut, Thermometer, Users, Menu } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export default function Layout({ children }: { children: ReactNode }) {
  const nav = useNavigate();
  const { user, role } = useAuth();

  async function logout() {
    await supabase.auth.signOut();
    nav("/auth", { replace: true });
  }

  const isAdmin = role === "admin" || user?.email === "admin@admin.com";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card sticky top-0 z-40 shadow-sm">
        <div className="container flex items-center justify-between h-16">

          <div className="flex items-center gap-4">
            {isAdmin && (
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="md:hidden">
                    <Menu className="w-5 h-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[260px] bg-card">
                  <nav className="flex flex-col gap-2 mt-8">
                    <Button variant="ghost" className="justify-start gap-2" onClick={() => nav("/admin")}>
                      <Thermometer className="w-4 h-4 text-primary" /> Gerenciar Câmaras
                    </Button>
                    <Button variant="ghost" className="justify-start gap-2" onClick={() => nav("/admin/users")}>
                      <Users className="w-4 h-4 text-primary" /> Criar Usuários
                    </Button>
                  </nav>
                </SheetContent>
              </Sheet>
            )}

            {/* LOGO */}
            <button onClick={() => nav("/")} className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center shadow-sm">
                <Snowflake className="text-primary-foreground w-5 h-5" />
              </div>
              <div className="text-left leading-tight">
                <div className="font-bold tracking-tight text-[15px]">
                  Frio<span className="text-primary">Ctrl</span>
                </div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-[0.14em] hidden sm:block">
                  Monitoramento remoto
                </div>
              </div>
            </button>

            {/* Komprão / Grupo Koch badge */}
            <div className="hidden md:flex items-center gap-2 pl-4 ml-1 border-l border-border">
              <div className="flex h-8 items-center gap-2 rounded-md bg-secondary px-3">
                <span className="inline-block w-1.5 h-4 rounded-sm bg-primary" />
                <div className="leading-tight">
                  <div className="text-[11px] font-bold tracking-tight text-foreground">Komprão Atacadista</div>
                  <div className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">Grupo Koch</div>
                </div>
              </div>
            </div>

            {isAdmin && (
              <nav className="hidden lg:flex items-center gap-1 pl-4 ml-1 border-l border-border">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => nav("/admin")}
                  className="text-xs font-medium gap-1.5 h-8 text-muted-foreground hover:text-foreground hover:bg-secondary"
                >
                  <Thermometer className="w-3.5 h-3.5 text-primary" />
                  Câmaras
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => nav("/admin/users")}
                  className="text-xs font-medium gap-1.5 h-8 text-muted-foreground hover:text-foreground hover:bg-secondary"
                >
                  <Users className="w-3.5 h-3.5 text-primary" />
                  Usuários
                </Button>
              </nav>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right text-xs hidden sm:block leading-tight">
              <div className="text-foreground font-medium">{user?.email}</div>
              <div className="text-muted-foreground uppercase tracking-widest text-[9px]">
                {isAdmin ? "Administrador" : "Cliente"}
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={logout} className="h-9 gap-2">
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sair</span>
            </Button>
          </div>
        </div>
      </header>
      <main className="container py-8">{children}</main>
    </div>
  );
}