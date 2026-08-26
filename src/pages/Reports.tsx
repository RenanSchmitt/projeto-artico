import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, BarChart3, CalendarDays, CheckCircle2, FileText, Loader2, Printer, Snowflake, Thermometer } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

type Chamber = { id:string;name:string;location:string|null;tenant_id:string;setpoint:number;min_temp:number;max_temp:number };
type Tenant = { id:string;name:string;city:string|null };
type Reading = { id:string;temperature:number;compressor_on:boolean;defrost_on:boolean;door_open:boolean;recorded_at:string };
type Alarm = { id:string;severity:string;message:string;created_at:string };
type DailyRow = { date:string;label:string;minimum:number;average:number;maximum:number;records:number;compliance:number };

const PAGE_SIZE=1000;
const fmt=(value:number,digits=1)=>value.toLocaleString("pt-BR",{minimumFractionDigits:digits,maximumFractionDigits:digits});

async function fetchAllTelemetry(chamberId:string,since:string,onProgress:(loaded:number,total:number)=>void){
  const {count,error:countError}=await supabase.from("telemetry").select("id",{count:"exact",head:true}).eq("chamber_id",chamberId).gte("recorded_at",since);
  if(countError)throw countError;
  const total=count??0;
  if(total===0){onProgress(0,0);return[]}

  const pages=Math.ceil(total/PAGE_SIZE),rows:Reading[]=[];
  // Limita a concorrência para acelerar sem sobrecarregar o Supabase.
  for(let firstPage=0;firstPage<pages;firstPage+=6){
    const batch=Array.from({length:Math.min(6,pages-firstPage)},(_,offset)=>firstPage+offset);
    const results=await Promise.all(batch.map(async page=>{
      const from=page*PAGE_SIZE;
      const {data,error}=await supabase.from("telemetry").select("id, temperature, compressor_on, defrost_on, door_open, recorded_at").eq("chamber_id",chamberId).gte("recorded_at",since).order("recorded_at",{ascending:true}).order("id",{ascending:true}).range(from,Math.min(from+PAGE_SIZE-1,total-1));
      if(error)throw error;
      return(data??[]) as Reading[];
    }));
    results.forEach(page=>rows.push(...page));
    onProgress(Math.min(rows.length,total),total);
  }
  return rows.sort((a,b)=>new Date(a.recorded_at).getTime()-new Date(b.recorded_at).getTime());
}

function downsample<T>(rows:T[],maximum=600){if(rows.length<=maximum)return rows;const step=Math.ceil(rows.length/maximum);return rows.filter((_,index)=>index%step===0||index===rows.length-1)}

export default function Reports(){
  const {user,role,loading:authLoading}=useAuth();
  const [chambers,setChambers]=useState<Chamber[]>([]),[tenants,setTenants]=useState<Tenant[]>([]);
  const [selectedId,setSelectedId]=useState(""),[readings,setReadings]=useState<Reading[]>([]),[alarms,setAlarms]=useState<Alarm[]>([]);
  const [loading,setLoading]=useState(false),[loadProgress,setLoadProgress]=useState(""),[generated,setGenerated]=useState(false),[generatedAt,setGeneratedAt]=useState<Date|null>(null);

  // Limpa imediatamente qualquer dado pertencente à sessão anterior.
  useEffect(()=>{
    setChambers([]);setTenants([]);setSelectedId("");setReadings([]);setAlarms([]);setGenerated(false);setGeneratedAt(null);
  },[user?.id]);

  useEffect(()=>{
    if(!user||role===null)return;
    let cancelled=false;
    (async()=>{
      try{
        // Lê o tenant diretamente do banco para não depender do estado do React.
        const {data:databaseTenantId,error:tenantIdError}=await supabase.rpc("current_tenant_id");
        if(tenantIdError)throw tenantIdError;
        let chambersQuery=supabase.from("chambers").select("id, name, location, tenant_id, setpoint, min_temp, max_temp").order("name");
        let tenantsQuery=supabase.from("tenants").select("id, name, city").order("name");
        const isGlobalAdmin=role==="admin"&&!databaseTenantId;
        if(!isGlobalAdmin){
          if(!databaseTenantId){
            setChambers([]);setTenants([]);setSelectedId("");setGenerated(false);
            toast.error("Esta conta não está vinculada a uma empresa. Informe o tenant_id no perfil do usuário.");
            return;
          }
          chambersQuery=chambersQuery.eq("tenant_id",databaseTenantId);
          tenantsQuery=tenantsQuery.eq("id",databaseTenantId);
        }
        const [{data:chs,error:chError},{data:ts,error:tError}]=await Promise.all([chambersQuery,tenantsQuery]);
        if(chError)throw chError;if(tError)throw tError;
        if(!cancelled){setChambers((chs??[]) as Chamber[]);setTenants((ts??[]) as Tenant[]);setSelectedId("");setGenerated(false)}
      }catch(error:any){toast.error(error.message||"Não foi possível carregar as câmaras.")}
    })();
    return()=>{cancelled=true};
  },[user,role]);

  const chamber=chambers.find(item=>item.id===selectedId),tenant=tenants.find(item=>item.id===chamber?.tenant_id);
  const periodEnd=generatedAt??new Date(),periodStart=new Date(periodEnd.getTime()-30*24*60*60*1000);

  async function generateReport(){if(!chamber){toast.error("Selecione uma câmara disponível para sua conta.");return}setLoading(true);setLoadProgress("Preparando...");setGenerated(false);try{const end=new Date(),start=new Date(end.getTime()-30*24*60*60*1000);const [telemetry,{data:alarmData,error:alarmError}]=await Promise.all([fetchAllTelemetry(chamber.id,start.toISOString(),(loaded,total)=>setLoadProgress(total?`${Math.round((loaded/total)*100)}% carregado`:"Sem registros")),supabase.from("alarms").select("id, severity, message, created_at").eq("chamber_id",chamber.id).gte("created_at",start.toISOString()).order("created_at",{ascending:false})]);if(alarmError)throw alarmError;setReadings(telemetry);setAlarms((alarmData??[]) as Alarm[]);setGeneratedAt(end);setGenerated(true);if(telemetry.length===0)toast.warning("A câmara não possui telemetria nos últimos 30 dias.")}catch(error:any){console.error("Erro ao gerar relatório:",error);toast.error(error.message||"Não foi possível gerar o relatório.")}finally{setLoading(false);setLoadProgress("")}}

  const stats=useMemo(()=>{if(!chamber||readings.length===0)return null;const values=readings.map(r=>Number(r.temperature));const inRange=readings.filter(r=>Number(r.temperature)>=Number(chamber.min_temp)&&Number(r.temperature)<=Number(chamber.max_temp)).length;return{minimum:Math.min(...values),maximum:Math.max(...values),average:values.reduce((a,b)=>a+b,0)/values.length,compliance:(inRange/readings.length)*100,compressor:(readings.filter(r=>r.compressor_on).length/readings.length)*100,defrost:(readings.filter(r=>r.defrost_on).length/readings.length)*100,door:(readings.filter(r=>r.door_open).length/readings.length)*100}},[chamber,readings]);

  const daily=useMemo<DailyRow[]>(()=>{if(!chamber)return[];const groups=new Map<string,Reading[]>();for(const row of readings){const date=new Date(row.recorded_at).toLocaleDateString("sv-SE",{timeZone:"America/Sao_Paulo"});groups.set(date,[...(groups.get(date)??[]),row])}return [...groups.entries()].map(([date,rows])=>{const values=rows.map(r=>Number(r.temperature)),inside=values.filter(v=>v>=Number(chamber.min_temp)&&v<=Number(chamber.max_temp)).length;return{date,label:new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR"),minimum:Math.min(...values),average:values.reduce((a,b)=>a+b,0)/values.length,maximum:Math.max(...values),records:rows.length,compliance:(inside/rows.length)*100}}).sort((a,b)=>a.date.localeCompare(b.date))},[chamber,readings]);

  const chartData=useMemo(()=>downsample(readings).map(row=>({time:new Date(row.recorded_at).getTime(),temperature:Number(row.temperature),label:new Date(row.recorded_at).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})})),[readings]);

  if(authLoading)return null;if(!user)return <Navigate to="/auth" replace/>;
  return <Layout title="Relatórios" subtitle="Histórico consolidado dos últimos 30 dias">
    <div className="space-y-5">
      <Card className="report-controls p-5 print:hidden"><div className="flex flex-col gap-4 lg:flex-row lg:items-end"><div className="flex-1"><label className="mb-2 block text-xs font-semibold text-muted-foreground">Câmara frigorífica</label><Select value={selectedId} onValueChange={value=>{setSelectedId(value);setGenerated(false)}}><SelectTrigger className="h-11 bg-background"><SelectValue placeholder="Selecione a câmara para gerar o relatório"/></SelectTrigger><SelectContent>{chambers.map(item=>{const owner=tenants.find(t=>t.id===item.tenant_id);return <SelectItem key={item.id} value={item.id}>{item.name} · {owner?.name||"Sem empresa"}</SelectItem>})}</SelectContent></Select></div><Button className="h-11 min-w-[190px] gap-2 px-6" onClick={generateReport} disabled={loading||!selectedId}>{loading?<Loader2 className="h-4 w-4 animate-spin"/>:<BarChart3 className="h-4 w-4"/>}{loading?(loadProgress||"Carregando..."):"Gerar relatório"}</Button><Button className="h-11 gap-2" variant="outline" disabled={!generated||readings.length===0} onClick={()=>window.print()}><Printer className="h-4 w-4"/>Imprimir / Salvar PDF</Button></div></Card>

      {!generated?<Card className="report-empty p-14 text-center"><FileText className="mx-auto mb-4 h-11 w-11 text-muted-foreground"/><h2 className="text-lg font-semibold">Selecione uma câmara</h2><p className="mt-1 text-sm text-muted-foreground">O relatório reunirá toda a telemetria disponível dos últimos 30 dias, o gráfico e os alarmes registrados.</p></Card>:
      <article className="report-print space-y-5">
        <header className="report-document-header surface p-6"><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start"><div className="flex items-center gap-4"><div className="flex h-12 w-12 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary"><Snowflake className="h-7 w-7"/></div><div><div className="text-xl font-extrabold tracking-tight">FRIO<span className="text-primary">CTRL</span></div><p className="text-xs text-muted-foreground">Relatório de monitoramento frigorífico</p></div></div><div className="text-left text-xs sm:text-right"><p className="font-semibold">Período analisado</p><p className="text-muted-foreground">{periodStart.toLocaleDateString("pt-BR")} a {periodEnd.toLocaleDateString("pt-BR")}</p><p className="mt-1 text-muted-foreground">Emitido em {periodEnd.toLocaleString("pt-BR")}</p></div></div><div className="mt-6 grid gap-3 border-t border-border pt-5 sm:grid-cols-3"><Info label="Cliente" value={tenant?.name||"Não informado"}/><Info label="Câmara" value={chamber?.name||"—"}/><Info label="Localização" value={chamber?.location||tenant?.city||"Não informada"}/></div></header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Metric icon={Thermometer} label="Temperatura média" value={stats?`${fmt(stats.average)} °C`:"—"}/><Metric icon={Snowflake} label="Mínima registrada" value={stats?`${fmt(stats.minimum)} °C`:"—"}/><Metric icon={Thermometer} label="Máxima registrada" value={stats?`${fmt(stats.maximum)} °C`:"—"} alert={!!stats&&stats.maximum>Number(chamber?.max_temp)}/><Metric icon={CheckCircle2} label="Dentro da faixa" value={stats?`${fmt(stats.compliance)}%`:"—"}/><Metric icon={AlertTriangle} label="Alarmes" value={String(alarms.length)} alert={alarms.length>0}/></section>

        <Card className="report-section p-5"><div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow">Histórico de telemetria</p><h2 className="mt-1 text-lg font-bold">Temperatura nos últimos 30 dias</h2></div><div className="flex flex-wrap gap-3 text-xs text-muted-foreground"><span>Setpoint: <b className="text-foreground">{fmt(Number(chamber?.setpoint))} °C</b></span><span>Faixa: <b className="text-foreground">{fmt(Number(chamber?.min_temp))} a {fmt(Number(chamber?.max_temp))} °C</b></span><span>{readings.length.toLocaleString("pt-BR")} leituras</span></div></div><div className="h-[340px]"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{left:0,right:15,top:12,bottom:0}}><defs><linearGradient id="reportTemp" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#00e676" stopOpacity={.32}/><stop offset="100%" stopColor="#00e676" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 5" vertical={false}/><XAxis dataKey="time" type="number" domain={["dataMin","dataMax"]} scale="time" tickFormatter={value=>new Date(value).toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"})} stroke="hsl(var(--muted-foreground))" fontSize={10} minTickGap={35}/><YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} unit="°" width={42}/>{chamber&&<><ReferenceArea y1={Number(chamber.min_temp)} y2={Number(chamber.max_temp)} fill="#00e676" fillOpacity={.055}/><ReferenceLine y={Number(chamber.setpoint)} stroke="#4ea1ff" strokeDasharray="5 5"/><ReferenceLine y={Number(chamber.max_temp)} stroke="#ff4d4f" strokeDasharray="3 4"/><ReferenceLine y={Number(chamber.min_temp)} stroke="#f5b942" strokeDasharray="3 4"/></>}<Tooltip labelFormatter={(_,payload)=>payload?.[0]?.payload?.label||""} formatter={(value:number)=>[`${fmt(value,2)} °C`,"Temperatura"]} contentStyle={{background:"#121816",border:"1px solid #26312d",borderRadius:10,fontSize:12}}/><Area type="monotone" dataKey="temperature" stroke="#00e676" strokeWidth={2} fill="url(#reportTemp)" isAnimationActive={false}/></AreaChart></ResponsiveContainer></div></Card>

        <section className="grid gap-5 xl:grid-cols-[1fr_360px]"><Card className="report-section overflow-hidden"><div className="border-b border-border p-5"><p className="eyebrow">Consolidação diária</p><h2 className="mt-1 text-lg font-bold">Resumo das leituras</h2></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground"><tr><th className="px-4 py-3 text-left">Data</th><th className="px-4 py-3 text-right">Mín.</th><th className="px-4 py-3 text-right">Média</th><th className="px-4 py-3 text-right">Máx.</th><th className="px-4 py-3 text-right">Conformidade</th><th className="px-4 py-3 text-right">Leituras</th></tr></thead><tbody className="divide-y divide-border">{daily.map(row=><tr key={row.date}><td className="px-4 py-3 font-medium">{row.label}</td><td className="sensor-value px-4 py-3 text-right">{fmt(row.minimum)}°</td><td className="sensor-value px-4 py-3 text-right">{fmt(row.average)}°</td><td className={`sensor-value px-4 py-3 text-right ${row.maximum>Number(chamber?.max_temp)?"text-status-alert":""}`}>{fmt(row.maximum)}°</td><td className="sensor-value px-4 py-3 text-right">{fmt(row.compliance)}%</td><td className="px-4 py-3 text-right text-muted-foreground">{row.records}</td></tr>)}</tbody></table></div></Card><Card className="report-section h-fit p-5"><p className="eyebrow">Operação dos equipamentos</p><h2 className="mt-1 text-lg font-bold">Indicadores do período</h2><div className="mt-5 space-y-5"><Progress label="Compressor ligado" value={stats?.compressor??0} color="bg-primary"/><Progress label="Degelo ativo" value={stats?.defrost??0} color="bg-blue-500"/><Progress label="Porta aberta" value={stats?.door??0} color="bg-yellow-500"/></div></Card></section>

        <Card className="report-section overflow-hidden"><div className="border-b border-border p-5"><p className="eyebrow">Ocorrências</p><h2 className="mt-1 text-lg font-bold">Alertas registrados no período</h2></div>{alarms.length===0?<div className="flex items-center gap-3 p-6 text-sm text-muted-foreground"><CheckCircle2 className="h-5 w-5 text-status-ok"/>Nenhum alerta registrado nos últimos 30 dias.</div>:<div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground"><tr><th className="px-5 py-3 text-left">Severidade</th><th className="px-5 py-3 text-left">Ocorrência</th><th className="px-5 py-3 text-right">Data e hora</th></tr></thead><tbody className="divide-y divide-border">{alarms.map(alarm=><tr key={alarm.id}><td className="px-5 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${alarm.severity==="critical"?"bg-red-500/10 text-status-alert":"bg-yellow-500/10 text-status-warn"}`}>{alarm.severity==="critical"?"Crítico":"Atenção"}</span></td><td className="px-5 py-3">{alarm.message}</td><td className="whitespace-nowrap px-5 py-3 text-right text-muted-foreground">{new Date(alarm.created_at).toLocaleString("pt-BR")}</td></tr>)}</tbody></table></div>}</Card>
        <footer className="report-footer hidden border-t border-border pt-3 text-[10px] text-muted-foreground"><span>FrioCtrl · Monitoramento remoto</span><span>Relatório gerado automaticamente. Os dados refletem os registros disponíveis no período.</span></footer>
      </article>}
    </div>
  </Layout>;
}

function Info({label,value}:{label:string;value:string}){return <div><p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1 font-semibold">{value}</p></div>}
function Metric({icon:Icon,label,value,alert=false}:{icon:typeof Thermometer;label:string;value:string;alert?:boolean}){return <Card className="report-metric flex items-center gap-3 p-4"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${alert?"bg-red-500/10 text-status-alert":"bg-primary/10 text-primary"}`}><Icon className="h-5 w-5"/></span><div><p className="text-[10px] font-semibold text-muted-foreground">{label}</p><p className={`sensor-value text-lg font-bold ${alert?"text-status-alert":""}`}>{value}</p></div></Card>}
function Progress({label,value,color}:{label:string;value:number;color:string}){const safe=Math.min(100,Math.max(0,value));return <div><div className="mb-2 flex justify-between text-xs"><span className="text-muted-foreground">{label}</span><span className="sensor-value font-semibold">{fmt(safe)}%</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${color}`} style={{width:`${safe}%`}}/></div></div>}
