import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import HeartbeatBanner from "@/components/HeartbeatBanner";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { Thermometer, Snowflake, DoorOpen, DoorClosed, Power } from "lucide-react";

type Chamber = { 
  id: string; 
  name: string; 
  location: string | null; 
  setpoint: number; 
  min_temp: number; 
  max_temp: number; 
  tenant_id: string 
};

type Tenant = { 
  id: string; 
  name: string; 
  city: string | null 
};

type Reading = { 
  temperature: number; 
  compressor_on: boolean; 
  defrost_on: boolean; 
  door_open: boolean; 
  recorded_at: string 
};

export default function Dashboard() {
  const { user, role: authRole, loading } = useAuth();
  const nav = useNavigate();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [chambers, setChambers] = useState<Chamber[]>([]);
  const [latest, setLatest] = useState<Record<string, Reading>>({});
  const [filter, setFilter] = useState<string>("all");
  
  // Controle estrito de acesso do administrador
  const [isAdmin, setIsAdmin] = useState<boolean>(false);

  useEffect(() => {
    if (loading || !user) return;
    
    let cancelled = false;

    async function fetchData() {
      try {
        // 1. Validação do Perfil do Usuário
        const { data: profData } = await supabase
          .from("profiles")
          .select("tenant_id, role")
          .eq("id", user.id)
          .maybeSingle();
        
        if (cancelled) return;

        // Validação Admin
        const checkAdmin = 
          user.email === "admin@gmail.com" || 
          user.email === "admin@admin.com" || 
          profData?.role === "admin" || 
          authRole === "admin";
          
        setIsAdmin(checkAdmin);

        // Ajuste de Tenant para conta de homologação/cliente específico
        let userTenantId = profData?.tenant_id;
        if (!checkAdmin && user.email === "jairo@gmail.com" && !userTenantId) {
          userTenantId = "d957e08c-31c6-4e75-80b2-53d7da76aacc";
        }

        // 2. Consultas de Clientes e Câmaras
        let tenantsQuery = supabase.from("tenants").select("*").order("name");
        let chambersQuery = supabase.from("chambers").select("*").order("name");

        if (!checkAdmin) {
          const filterId = userTenantId || "bloqueado-sem-tenant";
          chambersQuery = chambersQuery.eq("tenant_id", filterId);
          tenantsQuery = tenantsQuery.eq("id", filterId);
        }

        const [{ data: ts }, { data: chs }] = await Promise.all([
          tenantsQuery,
          chambersQuery,
        ]);

        if (cancelled) return;

        // 3. Atualização dos Estados de Clientes e Câmaras
        if (!checkAdmin) {
          const filterId = userTenantId || "bloqueado-sem-tenant";
          setTenants(ts ? ts.filter(t => t.id === filterId) : []);
          setChambers(chs ? chs.filter(c => c.tenant_id === filterId) : []);
        } else {
          setTenants(ts ?? []);
          setChambers(chs ?? []);
        }

        // 4. Busca da Telemetria com Retenção de Estado
        const validChambers = chs ?? [];
        const filteredChs = !checkAdmin
          ? validChambers.filter(c => c.tenant_id === (userTenantId || "bloqueado-sem-tenant"))
          : validChambers;

        if (filteredChs.length > 0) {
          const ids = filteredChs.map((c) => c.id);
          
          const { data: tel } = await supabase
            .from("telemetry")
            .select("chamber_id, temperature, compressor_on, defrost_on, door_open, recorded_at")
            .in("chamber_id", ids)
            .order("recorded_at", { ascending: false });

          if (tel && tel.length > 0) {
            setLatest((prevLatest) => {
              const updated = { ...prevLatest };
              
              // Processa do registro mais antigo ao mais recente
              const sortedTel = [...tel].reverse();

              for (const r of sortedTel) {
                const actualReading = r as Reading;
                const currentStored = updated[actualReading.chamber_id];

                // Atualiza se for a primeira leitura ou se o registro for mais novo/igual
                if (
                  !currentStored || 
                  new Date(actualReading.recorded_at) >= new Date(currentStored.recorded_at)
                ) {
                  updated[actualReading.chamber_id] = actualReading;
                }
              }
              return updated;
            });
          }
        }
      } catch (error) {
        console.error("Erro no fluxo do painel:", error);
      }
    }

    fetchData();
    const interval = setInterval(fetchData, 10_000);
    
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [user, authRole, loading]);

  // Filtro visual para Administradores
  const visibleChambers = useMemo(() => {
    if (!chambers) return [];
    if (isAdmin) {
      if (filter !== "all") return chambers.filter((c) => c?.tenant_id === filter);
      return chambers;
    }
    return chambers;
  }, [chambers, filter, isAdmin]);

  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-wide">PAINEL DE MONITORAMENTO</h1>
            <p className="text-sm text-muted-foreground">
              {isAdmin
                ? `${tenants?.length ?? 0} clientes · ${chambers?.length ?? 0} câmaras ativas`
                : `${chambers?.length ?? 0} câmaras vinculadas`}
            </p>
          </div>
          
          {isAdmin && tenants && tenants.length > 0 && (
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-[260px]">
                <SelectValue placeholder="Filtrar cliente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os clientes</SelectItem>
                {tenants.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} {t.city ? `· ${t.city}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <HeartbeatBanner />

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {visibleChambers.map((ch) => {
            if (!ch) return null;
            const r = latest[ch.id];
            const tenant = tenants?.find((t) => t.id === ch.tenant_id);
            const temp = r ? Number(r.temperature) : null;
            const alert = temp !== null && (temp > Number(ch.max_temp) || temp < Number(ch.min_temp));

            return (
              <Card
                key={ch.id}
                onClick={() => nav(`/system/${ch.id}`)}
                className={`group relative cursor-pointer p-5 bg-card shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lg ${
                  alert ? "border-status-alert ring-1 ring-status-alert/30" : "hover:border-primary/40"
                }`}
              >
                <div className="flex items-start justify-between mb-5">
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary/80 mb-0.5">
                      {tenant?.name || "Empresa Vinculada"}
                    </div>
                    <div className="font-semibold text-base leading-tight text-foreground truncate">{ch.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{ch.location}</div>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${
                      alert
                        ? "bg-status-alert/10 text-status-alert"
                        : "bg-status-ok/10 text-status-ok"
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${alert ? "pulse-alert" : "bg-status-ok pulse-ok"}`} />
                    {alert ? "Alerta" : "Normal"}
                  </span>
                </div>

                <div className="flex items-baseline gap-1">
                  <span className={`text-5xl font-bold tabular-nums tracking-tight ${alert ? "text-status-alert" : "text-status-ok"}`}>
                    {temp !== null ? temp.toFixed(1) : "—"}
                  </span>
                  <span className="text-2xl font-medium text-muted-foreground">°C</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1 mb-4">
                  Setpoint <span className="font-medium text-foreground">{Number(ch.setpoint).toFixed(1)}°C</span>
                  <span className="mx-1.5 text-border">·</span>
                  Faixa {Number(ch.min_temp).toFixed(1)} a {Number(ch.max_temp).toFixed(1)}°C
                </div>

                <div className="flex items-center gap-2 pt-3 border-t border-border">
                  <Pill label="COMP" on={r?.compressor_on} icon={<Power className="w-3 h-3" />} />
                  <Pill label="DEGELO" on={r?.defrost_on} icon={<Snowflake className="w-3 h-3" />} />
                  <Pill
                    label="PORTA"
                    on={r?.door_open}
                    warn
                    icon={r?.door_open ? <DoorOpen className="w-3 h-3" /> : <DoorClosed className="w-3 h-3" />}
                  />
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </Layout>
  );
}

function Pill({ label, on, icon, warn }: { label: string; on?: boolean; icon: React.ReactNode; warn?: boolean }) {
  const tone = on
    ? warn
      ? "bg-status-alert/10 text-status-alert"
      : "bg-status-ok/10 text-status-ok"
    : "bg-secondary text-muted-foreground";
  return (
    <span className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${tone}`}>
      {icon}
      <span>{label}</span>
      <span className="opacity-70">{on ? "ON" : "OFF"}</span>
    </span>
  );
}