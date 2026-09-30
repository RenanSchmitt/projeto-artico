import { ReactNode, useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Bell, FileBarChart, Gauge, LogOut, Menu, Search, Settings, Snowflake, Thermometer, Users, X, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

type LayoutProps = {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
};

type AlarmItem = {
  id: string;
  chamber_id: string;
  message?: string;
  type?: string;
  created_at: string;
  is_read?: boolean;
  chamber_name?: string;
};

const navigation = [
  { label: "Visão geral", path: "/", icon: Gauge },
  { label: "Relatórios", path: "/reports", icon: FileBarChart },
  { label: "Câmaras", path: "/admin", icon: Thermometer, admin: true },
  { label: "Clientes e usuários", path: "/admin/users", icon: Users, admin: true },
];

export default function Layout({
  children,
  title = "Visão geral",
  subtitle = "Monitoramento em tempo real",
  searchValue = "",
  onSearchChange,
}: LayoutProps) {
  const nav = useNavigate(); 
  const location = useLocation();
  const { user, role } = useAuth(); 
  const [mobileOpen, setMobileOpen] = useState(false);
  
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [alarms, setAlarms] = useState<AlarmItem[]>([]);
  const [loadingAlarms, setLoadingAlarms] = useState(false);

  const isAdmin = role === "admin" || user?.email === "admin@admin.com";

  async function logout() { 
    await supabase.auth.signOut(); 
    nav("/auth", { replace: true }); 
  }

  const menu = navigation.filter((item) => !item.admin || isAdmin);

  // Buscar alarmes filtrados por permissão do usuário
  useEffect(() => {
    if (!user) return;

    async function fetchAlarmsWithPermission() {
      try {
        setLoadingAlarms(true);

        // 1. Descobrir o perfil e o tenant_id do usuário logado (mesma regra do Dashboard)
        const { data: prof } = await supabase
          .from("profiles")
          .select("tenant_id, role")
          .eq("id", user.id)
          .maybeSingle();

        const userAdmin = isAdmin || prof?.role === "admin";
        let tenantId = prof?.tenant_id;
        
        // Exceção pontual idêntica à do seu painel principal, se aplicável
        if (!userAdmin && user.email === "jairo@gmail.com" && !tenantId) {
          tenantId = "d957e08c-31c6-4e75-80b2-53d7da76aacc";
        }

        // 2. Se NÃO for admin, precisamos descobrir quais IDs de câmaras pertencem ao tenant dele
        let allowedChamberIds: string[] = [];
        if (!userAdmin) {
          const targetTenant = tenantId || "bloqueado-sem-tenant";
          const { data: userChambers } = await supabase
            .from("chambers")
            .select("id")
            .eq("tenant_id", targetTenant);

          if (userChambers) {
            allowedChamberIds = userChambers.map(c => c.id);
          }

          // Se o cliente não tem nenhuma câmara vinculada, encerra por aqui sem mostrar alarmes
          if (allowedChamberIds.length === 0) {
            setAlarms([]);
            setLoadingAlarms(false);
            return;
          }
        }

        // 3. Montar a consulta de alarmes
        let query = supabase
          .from("alarms")
          .select("*, chambers(name, tenant_id)")
          .order("created_at", { ascending: false })
          .limit(10);

        // Se não for admin, filtra estritamente apenas os alarmes das câmaras dele
        if (!userAdmin) {
          query = query.in("chamber_id", allowedChamberIds);
        }

        const { data, error } = await query;

        if (!error && data) {
          // Mapeia para facilitar a exibição do nome da câmara junto ao alarme
          const formatted = data.map((item: any) => ({
            ...item,
            chamber_name: item.chambers?.name || "Câmara",
          }));
          setAlarms(formatted);
        }
      } catch (err) {
        console.error("Erro ao buscar alarmes com permissão:", err);
      } finally {
        setLoadingAlarms(false);
      }
    }

    fetchAlarmsWithPermission();
    const interval = setInterval(fetchAlarmsWithPermission, 15000);
    return () => clearInterval(interval);
  }, [user, isAdmin]);

  return <div className="min-h-screen bg-background text-foreground">
    {mobileOpen && <button aria-label="Fechar menu" className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} />}
    
    <aside className={`fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col border-r border-sidebar-border bg-sidebar transition-transform duration-200 lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
      <div className="flex h-20 items-center justify-between border-b border-sidebar-border px-5">
        <Link to="/" className="flex items-center gap-3" onClick={() => setMobileOpen(false)}>
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary"><Snowflake className="h-6 w-6" /></div>
          <div><div className="text-lg font-extrabold tracking-tight">FRIO<span className="text-primary">CTRL</span></div><div className="text-[9px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Monitoramento remoto</div></div>
        </Link>
        <Button className="lg:hidden" size="icon" variant="ghost" onClick={() => setMobileOpen(false)}><X className="h-5 w-5" /></Button>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-5">
        <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Operação</p>
        {menu.map(({ label, path, icon: Icon }) => { const active = path === "/" ? location.pathname === "/" : location.pathname.startsWith(path); return <Link key={path} to={path} onClick={() => setMobileOpen(false)} className={`group flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"}`}><Icon className="h-[18px] w-[18px]" /><span>{label}</span>{active && <span className="ml-auto h-5 w-0.5 rounded-full bg-primary" />}</Link>; })}
        {isAdmin && <div className="pt-6"><p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Administração</p><div className="flex h-11 items-center gap-3 rounded-lg px-3 text-sm text-muted-foreground/50"><Settings className="h-[18px] w-[18px]" /> Configurações</div></div>}
      </nav>
      <div className="m-3 rounded-xl border border-border bg-card/70 p-4"><div className="flex items-center gap-2 text-sm font-semibold"><span className="h-2 w-2 rounded-full bg-status-ok shadow-[0_0_10px_hsl(var(--status-ok)/.6)]" /> Sistema operacional</div><p className="mt-1 pl-4 text-xs text-muted-foreground">Todos os serviços online</p></div>
      <div className="border-t border-sidebar-border px-5 py-4 font-mono text-[10px] text-muted-foreground">FRIOCTRL v2.1.0</div>
    </aside>

    <div className="lg:pl-[260px]">
      <header className="app-header sticky top-0 z-30 flex h-20 items-center border-b border-border bg-background/90 px-4 backdrop-blur-xl sm:px-6 xl:px-8">
        <Button className="mr-3 lg:hidden" size="icon" variant="ghost" onClick={() => setMobileOpen(true)}><Menu className="h-5 w-5" /></Button>
        <div className="min-w-0"><h1 className="truncate text-xl font-bold tracking-tight sm:text-2xl">{title}</h1><p className="hidden text-xs text-muted-foreground sm:block">{subtitle}</p></div>
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <div className="relative hidden xl:block">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input type="search" value={searchValue} onChange={(event) => onSearchChange?.(event.target.value)} className="h-10 w-60 rounded-lg border border-input bg-card pl-9 pr-3 text-sm outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/10" placeholder="Buscar câmaras..." aria-label="Buscar câmaras" />
          </div>

          {/* Botão do Sininho Blindado por Permissão */}
          <div className="relative">
            <Button 
              variant="ghost" 
              size="icon" 
              className="relative" 
              onClick={() => setNotificationsOpen(!notificationsOpen)}
            >
              <Bell className="h-5 w-5" />
              {alarms.length > 0 && (
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-status-alert animate-pulse" />
              )}
            </Button>

            {/* Painel Flutuante de Alarmes */}
            {notificationsOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setNotificationsOpen(false)} />
                <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl border border-border bg-card p-4 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150">
                  <div className="flex items-center justify-between border-b border-border pb-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-status-alert/15 text-status-alert">
                        <AlertTriangle className="h-4 w-4" />
                      </span>
                      <h3 className="font-bold text-sm">Alertas da Empresa</h3>
                    </div>
                    <span className="text-[11px] text-muted-foreground font-semibold">{alarms.length} recentes</span>
                  </div>

                  <div className="max-h-80 overflow-y-auto space-y-2.5 py-3 pr-1">
                    {loadingAlarms && alarms.length === 0 ? (
                      <p className="text-center text-xs text-muted-foreground py-6">Carregando alarmes...</p>
                    ) : alarms.length === 0 ? (
                      <div className="text-center py-8">
                        <CheckCircle2 className="mx-auto h-8 w-8 text-status-ok mb-2 opacity-80" />
                        <p className="text-sm font-semibold">Tudo tranquilo!</p>
                        <p className="text-xs text-muted-foreground">Nenhum alarme para os seus equipamentos.</p>
                      </div>
                    ) : (
                      alarms.map((alarm) => (
                        <div 
                          key={alarm.id} 
                          onClick={() => {
                            if (alarm.chamber_id) {
                              setNotificationsOpen(false);
                              nav(`/system/${alarm.chamber_id}`);
                            }
                          }}
                          className="group cursor-pointer rounded-xl border border-border/60 bg-background/50 p-3 transition hover:border-status-alert/40 hover:bg-status-alert/5"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs font-bold text-status-alert line-clamp-1">
                              {alarm.chamber_name} — {alarm.message || alarm.type || "Alarme de Temperatura"}
                            </p>
                            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                              {new Date(alarm.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {new Date(alarm.created_at).toLocaleDateString("pt-BR")} às {new Date(alarm.created_at).toLocaleTimeString("pt-BR")}
                          </p>
                        </div>
                      ))
                    )}
                  </div>

                  {alarms.length > 0 && (
                    <div className="border-t border-border pt-2 text-center">
                      <button 
                        onClick={() => setNotificationsOpen(false)}
                        className="text-xs font-semibold text-primary hover:underline"
                      >
                        Fechar painel
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="hidden border-l border-border pl-4 text-right sm:block"><div className="max-w-40 truncate text-xs font-semibold">{user?.email}</div><div className="text-[9px] uppercase tracking-wider text-muted-foreground">{isAdmin ? "Administrador" : "Cliente"}</div></div>
          <Button variant="ghost" size="icon" onClick={logout} title="Sair"><LogOut className="h-4 w-4" /></Button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1680px] p-4 sm:p-6 xl:p-8">{children}</main>
    </div>
  </div>;
}