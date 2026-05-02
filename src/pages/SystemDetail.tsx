import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import HeartbeatBanner from "@/components/HeartbeatBanner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, Thermometer, Snowflake, DoorOpen, DoorClosed, Power, AlertCircle } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Chamber = { id: string; name: string; location: string | null; setpoint: number; min_temp: number; max_temp: number; tenant_id: string };
type Reading = { temperature: number; compressor_on: boolean; defrost_on: boolean; door_open: boolean; recorded_at: string };
type Alarm = { id: string; severity: string; message: string; created_at: string };

export default function SystemDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user, loading } = useAuth();
  const [chamber, setChamber] = useState<Chamber | null>(null);
  const [tenantName, setTenantName] = useState<string>("");
  const [history, setHistory] = useState<Reading[]>([]);
  const [latest, setLatest] = useState<Reading | null>(null);
  const [alarms, setAlarms] = useState<Alarm[]>([]);

  useEffect(() => {
    if (!id || !user) return;
    let cancelled = false;
    async function fetchAll() {
      supabase.functions.invoke("simulate-tick").catch(() => {});

      const since = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
      const [{ data: ch }, { data: hist }, { data: alm }] = await Promise.all([
        supabase.from("chambers").select("*").eq("id", id).maybeSingle(),
        supabase
          .from("telemetry")
          .select("temperature, compressor_on, defrost_on, door_open, recorded_at")
          .eq("chamber_id", id)
          .gte("recorded_at", since)
          .order("recorded_at", { ascending: true }),
        supabase
          .from("alarms")
          .select("*")
          .eq("chamber_id", id)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);
      if (cancelled) return;
      setChamber(ch);
      setHistory(hist ?? []);
      setLatest(hist && hist.length ? hist[hist.length - 1] : null);
      setAlarms(alm ?? []);
      if (ch) {
        const { data: tn } = await supabase.from("tenants").select("name").eq("id", ch.tenant_id).maybeSingle();
        if (!cancelled) setTenantName(tn?.name ?? "");
      }
    }
    fetchAll();
    const i = setInterval(fetchAll, 10_000);
    return () => { cancelled = true; clearInterval(i); };
  }, [id, user]);

  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;

  const temp = latest ? Number(latest.temperature) : null;
  const alert = chamber && temp !== null && (temp > Number(chamber.max_temp) || temp < Number(chamber.min_temp));

  const chartData = history.map((r) => ({
    t: new Date(r.recorded_at).getTime(),
    label: new Date(r.recorded_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    temperature: Number(r.temperature),
  }));

  return (
    <Layout>
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => nav("/")} className="-ml-3">
          <ArrowLeft className="w-4 h-4 mr-2" /> Voltar ao painel
        </Button>

        {chamber && (
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{tenantName}</div>
              <h1 className="text-3xl font-bold tracking-wide">{chamber.name}</h1>
              <p className="text-sm text-muted-foreground">{chamber.location}</p>
            </div>
            <div className={`text-right ${alert ? "text-status-alert" : "text-status-ok"}`}>
              <div className="text-6xl font-bold tabular-nums leading-none">
                {temp !== null ? temp.toFixed(1) : "—"}<span className="text-2xl text-muted-foreground"> °C</span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Setpoint {Number(chamber.setpoint).toFixed(1)}°C · Faixa {Number(chamber.min_temp).toFixed(1)} a {Number(chamber.max_temp).toFixed(1)}°C
              </div>
            </div>
          </div>
        )}

        <HeartbeatBanner chamberId={id} />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Tile label="Temperatura" value={temp !== null ? `${temp.toFixed(1)}°C` : "—"} icon={<Thermometer />} alert={!!alert} />
          <Tile label="Compressor" value={latest?.compressor_on ? "ON" : "OFF"} icon={<Power />} active={latest?.compressor_on} />
          <Tile label="Degelo" value={latest?.defrost_on ? "ATIVO" : "INATIVO"} icon={<Snowflake />} active={latest?.defrost_on} />
          <Tile
            label="Porta"
            value={latest?.door_open ? "ABERTA" : "FECHADA"}
            icon={latest?.door_open ? <DoorOpen /> : <DoorClosed />}
            alert={latest?.door_open}
          />
        </div>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Telemetria</div>
              <h2 className="text-lg font-bold">Últimas 12 horas</h2>
            </div>
            <div className="text-xs text-muted-foreground">{chartData.length} amostras</div>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="tempG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--status-ok))" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="hsl(var(--status-ok))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={10} interval="preserveStartEnd" minTickGap={48} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} unit="°" width={40} />
                {chamber && (
                  <>
                    <ReferenceLine y={Number(chamber.setpoint)} stroke="hsl(var(--primary))" strokeDasharray="4 4" />
                    <ReferenceLine y={Number(chamber.max_temp)} stroke="hsl(var(--status-alert))" strokeDasharray="2 2" />
                    <ReferenceLine y={Number(chamber.min_temp)} stroke="hsl(var(--status-warn))" strokeDasharray="2 2" />
                  </>
                )}
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                  labelStyle={{ color: "hsl(var(--muted-foreground))" }}
                  formatter={(v: number) => [`${v.toFixed(2)}°C`, "Temperatura"]}
                />
                <Area type="monotone" dataKey="temperature" stroke="hsl(var(--status-ok))" strokeWidth={2} fill="url(#tempG)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle className="text-status-warn" />
            <h2 className="text-lg font-bold">Histórico de alarmes (últimos 10)</h2>
          </div>
          {alarms.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-6">Nenhum alarme registrado.</div>
          ) : (
            <div className="divide-y divide-border">
              {alarms.map((a) => {
                const c =
                  a.severity === "critical" ? "text-status-alert" :
                  a.severity === "warning" ? "text-status-warn" : "text-muted-foreground";
                return (
                  <div key={a.id} className="py-3 flex items-start gap-3">
                    <div className={`w-2 h-2 rounded-full mt-2 ${
                      a.severity === "critical" ? "bg-status-alert pulse-alert" :
                      a.severity === "warning" ? "bg-status-warn" : "bg-status-offline"
                    }`} />
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-4">
                        <span className={`text-xs font-bold uppercase tracking-widest ${c}`}>{a.severity}</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(a.created_at).toLocaleString("pt-BR")}
                        </span>
                      </div>
                      <div className="text-sm">{a.message}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </Layout>
  );
}

function Tile({ label, value, icon, active, alert }: { label: string; value: string; icon: React.ReactNode; active?: boolean; alert?: boolean }) {
  const color = alert ? "text-status-alert" : active ? "text-status-ok" : "text-muted-foreground";
  return (
    <Card className={`p-4 ${alert ? "border-status-alert glow-alert" : ""}`}>
      <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground mb-2">
        <span className={color}>{icon}</span>
        {label}
      </div>
      <div className={`text-2xl font-bold tabular-nums ${color}`}>{value}</div>
    </Card>
  );
}
