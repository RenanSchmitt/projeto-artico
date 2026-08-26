import { ReactNode, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Bell, FileBarChart, Gauge, LogOut, Menu, Search, Settings, Snowflake, Thermometer, Users, X } from "lucide-react";
// import { Bell, ChevronDown, FileBarChart, Gauge, LogOut, Menu, Search, Settings, Snowflake, Thermometer, Users, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

type LayoutProps = {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
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
  const nav = useNavigate(); const location = useLocation();
  const { user, role } = useAuth(); const [mobileOpen, setMobileOpen] = useState(false);
  const isAdmin = role === "admin" || user?.email === "admin@admin.com";
  async function logout() { await supabase.auth.signOut(); nav("/auth", { replace: true }); }
  const menu = navigation.filter((item) => !item.admin || isAdmin);

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
          <div className="relative hidden xl:block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input type="search" value={searchValue} onChange={(event) => onSearchChange?.(event.target.value)} className="h-10 w-60 rounded-lg border border-input bg-card pl-9 pr-3 text-sm outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/10" placeholder="Buscar câmaras..." aria-label="Buscar câmaras" /></div>
          {/* <Button variant="outline" className="hidden h-10 gap-2 bg-card md:flex">Todos os clientes <ChevronDown className="h-4 w-4 text-muted-foreground" /></Button> */}
          <Button variant="ghost" size="icon" className="relative"><Bell className="h-5 w-5" /><span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-status-alert" /></Button>
          <div className="hidden border-l border-border pl-4 text-right sm:block"><div className="max-w-40 truncate text-xs font-semibold">{user?.email}</div><div className="text-[9px] uppercase tracking-wider text-muted-foreground">{isAdmin ? "Administrador" : "Cliente"}</div></div>
          <Button variant="ghost" size="icon" onClick={logout} title="Sair"><LogOut className="h-4 w-4" /></Button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1680px] p-4 sm:p-6 xl:p-8">{children}</main>
    </div>
  </div>;
}
