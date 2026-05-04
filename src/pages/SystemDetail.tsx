import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import HeartbeatBanner from "@/components/HeartbeatBanner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, Thermometer, Snowflake, DoorOpen, DoorClosed, Power, AlertCircle, Gauge, Activity, Settings2 } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Chamber = { id: string; name: string; location: string | null; setpoint: number; min_temp: number; max_temp: number; tenant_id: string };
type Reading = {
  temperature: number; compressor_on: boolean; defrost_on: boolean; door_open: boolean; recorded_at: string;
  suction_pressure: number | null; evaporation_pressure: number | null;
  superheat: number | null; subcooling: number | null; condensation_temp: number | null;
  eev_opening: number | null; eev_steps: number | null;
};
type Alarm = { id: string; severity: string; message: string; created_at: string };
type PressureUnit = "BAR" | "PSI";

export default function SystemDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user, loading } = useAuth();
  const [chamber, setChamber] = useState<Chamber | null>(null);
  const [tenantName, setTenantName] = useState<string>("");
  const [history, setHistory] = useState<Reading[]>([]);
  const [latest, setLatest] = useState<Reading | null>(null);
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [pUnit, setPUnit] = useState<PressureUnit>("BAR");

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
          .select("temperature, compressor_on, defrost_on, door_open, recorded_at, suction_pressure, evaporation_pressure, superheat, subcooling, condensation_temp, eev_opening, eev_steps")
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

        <EngineeringPanel latest={latest} unit={pUnit} setUnit={setPUnit} />

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

const BAR_TO_PSI = 14.5038;
const fmtP = (barVal: number | null, unit: PressureUnit) => {
  if (barVal === null || barVal === undefined) return "—";
  const v = unit === "BAR" ? barVal : barVal * BAR_TO_PSI;
  return v.toFixed(unit === "BAR" ? 2 : 1);
};

function EngineeringPanel({
  latest, unit, setUnit,
}: { latest: Reading | null; unit: PressureUnit; setUnit: (u: PressureUnit) => void }) {
  const sh = latest?.superheat ?? null;
  const sc = latest?.subcooling ?? null;
  const shStatus = sh === null ? "off" : sh >= 5 && sh <= 10 ? "ok" : "alert";
  const scStatus = sc === null ? "off" : sc >= 3 && sc <= 7 ? "ok" : "alert";
  const eevPct = latest?.eev_opening ?? 0;
  const eevSteps = latest?.eev_steps ?? 0;

  const statusColor = (s: string) =>
    s === "ok" ? "text-status-ok" : s === "alert" ? "text-status-alert" : "text-status-offline";
  const statusBg = (s: string) =>
    s === "ok" ? "bg-status-ok" : s === "alert" ? "bg-status-alert" : "bg-status-offline";

  return (
    <Card className="p-5 font-mono">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Settings2 className="text-status-ok" />
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">PLC · Refrigeration Telemetry</div>
            <h2 className="text-lg font-bold tracking-wide">Painel de Engenharia</h2>
          </div>
        </div>
        <div className="flex items-center gap-1 text-[10px] border border-border rounded-md p-0.5">
          {(["BAR", "PSI"] as PressureUnit[]).map((u) => (
            <button
              key={u}
              onClick={() => setUnit(u)}
              className={`px-2.5 py-1 rounded-sm uppercase tracking-widest transition ${
                unit === u ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {u}
            </button>
          ))}
        </div>
      </div>

      {/* Pressures */}
      <div className="grid gap-3 sm:grid-cols-2 mb-4">
        <PlcGauge
          label="Pressão de Sucção"
          value={fmtP(latest?.suction_pressure ?? null, unit)}
          unit={unit}
          icon={<Gauge className="w-3.5 h-3.5" />}
          tone="ok"
        />
        <PlcGauge
          label="Pressão de Evaporação"
          value={fmtP(latest?.evaporation_pressure ?? null, unit)}
          unit={unit}
          icon={<Gauge className="w-3.5 h-3.5" />}
          tone="ok"
        />
      </div>

      {/* Thermo perf */}
      <div className="grid gap-3 sm:grid-cols-3 mb-4">
        <PlcMetric
          label="Super-aquecimento (SH)"
          value={sh !== null ? `${sh.toFixed(1)} K` : "—"}
          range="ideal 5–10 K"
          status={shStatus}
        />
        <PlcMetric
          label="Sub-resfriamento (SC)"
          value={sc !== null ? `${sc.toFixed(1)} K` : "—"}
          range="ideal 3–7 K"
          status={scStatus}
        />
        <PlcMetric
          label="Temp. de Condensação"
          value={latest?.condensation_temp != null ? `${Number(latest.condensation_temp).toFixed(1)} °C` : "—"}
          range="referência ~35 °C"
          status="off"
        />
      </div>

      {/* EEV */}
      <div className="border border-border rounded-md p-4 bg-secondary/40">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
            <Activity className="w-3.5 h-3.5 text-status-ok" />
            Válvula de Expansão Eletrônica · EEV
          </div>
          <div className="text-[10px] text-muted-foreground tabular-nums">
            <span className="text-status-ok font-bold">{eevSteps}</span> / 480 steps
          </div>
        </div>
        <div className="flex items-end justify-between gap-4 mb-2">
          <div className="text-3xl font-bold tabular-nums text-status-ok">
            {eevPct.toFixed(1)}<span className="text-sm text-muted-foreground"> %</span>
          </div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-widest">Abertura</div>
        </div>
        <div className="h-3 w-full bg-background rounded-sm overflow-hidden border border-border">
          <div
            className="h-full bg-status-ok transition-all"
            style={{ width: `${Math.min(100, Math.max(0, eevPct))}%`, boxShadow: "0 0 12px hsl(var(--status-ok) / 0.7)" }}
          />
        </div>
        <div className="flex justify-between text-[9px] text-muted-foreground mt-1 tabular-nums">
          <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
        </div>
      </div>
    </Card>
  );
}

function PlcGauge({
  label, value, unit, icon, tone,
}: { label: string; value: string; unit: string; icon: React.ReactNode; tone: "ok" | "alert" | "off" }) {
  const color = tone === "ok" ? "text-status-ok" : tone === "alert" ? "text-status-alert" : "text-muted-foreground";
  return (
    <div className="border border-border rounded-md p-4 bg-secondary/40">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
          <span className={color}>{icon}</span>{label}
        </div>
        <span className="text-[9px] text-muted-foreground tracking-widest">{unit}</span>
      </div>
      <div className={`text-4xl font-bold tabular-nums ${color}`} style={{ textShadow: "0 0 16px hsl(var(--status-ok) / 0.4)" }}>
        {value}
      </div>
    </div>
  );
}

function PlcMetric({
  label, value, range, status,
}: { label: string; value: string; range: string; status: "ok" | "alert" | "off" }) {
  const color = status === "ok" ? "text-status-ok" : status === "alert" ? "text-status-alert" : "text-foreground";
  const dot = status === "ok" ? "bg-status-ok pulse-ok" : status === "alert" ? "bg-status-alert pulse-alert" : "bg-status-offline";
  return (
    <div className="border border-border rounded-md p-4 bg-secondary/40">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
        <span className={`w-2 h-2 rounded-full ${dot}`} />
      </div>
      <div className={`text-2xl font-bold tabular-nums ${color}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground mt-1">{range}</div>
    </div>
  );
}
