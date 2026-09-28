import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, ChevronUp, DoorClosed, DoorOpen, Power, Snowflake, Thermometer, WifiOff, MapPin } from "lucide-react";

type Chamber = { id:string;name:string;location:string|null;setpoint:number;min_temp:number;max_temp:number;tenant_id:string };
type Tenant = { id:string;name:string;city:string|null };
type Reading = { chamber_id:string;temperature:number;compressor_on:boolean;defrost_on:boolean;door_open:boolean;recorded_at:string };
type Status = "normal"|"warning"|"critical"|"offline";

function getStatus(chamber:Chamber, reading?:Reading):Status {
  if (!reading || Date.now()-new Date(reading.recorded_at).getTime()>5*60*1000) return "offline";
  const value=Number(reading.temperature), min=Number(chamber.min_temp), max=Number(chamber.max_temp);
  if(value<min||value>max) return "critical";
  return "normal";
}

const statusMeta={
  normal:{label:"Normal",dot:"bg-status-ok",text:"text-status-ok",icon:CheckCircle2},
  warning:{label:"Em atenção",dot:"bg-status-warn",text:"text-status-warn",icon:AlertTriangle},
  critical:{label:"Crítica",dot:"bg-status-alert",text:"text-status-alert",icon:AlertTriangle},
  offline:{label:"Offline",dot:"bg-status-offline",text:"text-status-offline",icon:WifiOff},
};

export default function Dashboard(){
  const {user,role:authRole,loading}=useAuth(); const nav=useNavigate();
  const [tenants,setTenants]=useState<Tenant[]>([]),[chambers,setChambers]=useState<Chamber[]>([]);
  const [latest,setLatest]=useState<Record<string,Reading>>({}); const [filter,setFilter]=useState("all"); const [search,setSearch]=useState(""); const [isAdmin,setIsAdmin]=useState(false);
  
  // Estado para controlar quais localizações estão expandidas (todas abertas por padrão)
  const [expandedLocations, setExpandedLocations]=useState<Record<string, boolean>>({});

  useEffect(()=>{ if(loading||!user)return; let cancelled=false;
    async function fetchData(){try{
      const {data:prof}=await supabase.from("profiles").select("tenant_id, role").eq("id",user.id).maybeSingle(); if(cancelled)return;
      const admin=user.email==="admin@gmail.com"||user.email==="admin@admin.com"||prof?.role==="admin"||authRole==="admin"; setIsAdmin(admin);
      let tenantId=prof?.tenant_id; if(!admin&&user.email==="jairo@gmail.com"&&!tenantId)tenantId="d957e08c-31c6-4e75-80b2-53d7da76aacc";
      let tq=supabase.from("tenants").select("*").order("name"),cq=supabase.from("chambers").select("*").order("name");
      if(!admin){const id=tenantId||"bloqueado-sem-tenant";tq=tq.eq("id",id);cq=cq.eq("tenant_id",id)}
      const [{data:ts},{data:chs}]=await Promise.all([tq,cq]);if(cancelled)return;setTenants(ts??[]);setChambers(chs??[]);
      
      // Inicializa todas as localizações como expandidas
      if(chs){
        const locs: Record<string, boolean> = {};
        chs.forEach(c => { const loc = c.location || "Outros / Sem Localização"; locs[loc] = true; });
        setExpandedLocations(locs);
      }

      if(chs?.length){const ids=chs.map(c=>c.id);const {data:tel}=await supabase.from("telemetry").select("chamber_id, temperature, compressor_on, defrost_on, door_open, recorded_at").in("chamber_id",ids).order("recorded_at",{ascending:false});
        if(tel){const map:Record<string,Reading>={};for(const row of tel as Reading[])if(!map[row.chamber_id])map[row.chamber_id]=row;setLatest(map)}}
    }catch(error){console.error("Erro no painel:",error)}} fetchData();const timer=setInterval(fetchData,10000);return()=>{cancelled=true;clearInterval(timer)};
  },[user,authRole,loading]);

  const visible=useMemo(()=>{
    let result=isAdmin&&filter!=="all"?chambers.filter(c=>c.tenant_id===filter):chambers;
    const term=search.trim().toLocaleLowerCase("pt-BR");
    if(term){
      result=result.filter(chamber=>{
        const tenant=tenants.find(item=>item.id===chamber.tenant_id);
        const text=[chamber.name,chamber.location,tenant?.name,tenant?.city].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");
        return text.includes(term);
      });
    }
    return result;
  },[chambers,tenants,filter,isAdmin,search]);

  // Agrupa as câmaras visíveis por localização
  const groupedByLocation = useMemo(() => {
    const map: Record<string, Chamber[]> = {};
    visible.forEach(chamber => {
      const loc = chamber.location || "Outros / Sem Localização";
      if (!map[loc]) map[loc] = [];
      map[loc].push(chamber);
    });
    return map;
  }, [visible]);

  const totals=useMemo(()=>visible.reduce((acc,c)=>{acc[getStatus(c,latest[c.id])]++;return acc},{normal:0,warning:0,critical:0,offline:0}),[visible,latest]);
  
  const toggleLocation = (loc: string) => {
    setExpandedLocations(prev => ({ ...prev, [loc]: !prev[loc] }));
  };

  if(loading)return null;if(!user)return <Navigate to="/auth" replace/>;

  return <Layout title="Visão geral" subtitle="Monitoramento em tempo real das câmaras frigoríficas" searchValue={search} onSearchChange={setSearch}>
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="eyebrow">Resumo operacional</p><h2 className="mt-1 text-lg font-semibold">{isAdmin?`${tenants.length} clientes monitorados`:`${chambers.length} câmaras vinculadas`}</h2></div>
        {isAdmin&&tenants.length>0&&<Select value={filter} onValueChange={setFilter}><SelectTrigger className="w-full bg-card sm:w-[260px]"><SelectValue placeholder="Filtrar cliente"/></SelectTrigger><SelectContent><SelectItem value="all">Todos os clientes</SelectItem>{tenants.map(t=><SelectItem key={t.id} value={t.id}>{t.name}{t.city?` · ${t.city}`:""}</SelectItem>)}</SelectContent></Select>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={Thermometer} value={visible.length} label="Câmaras" detail="Total monitorado" tone="info"/>
        <Kpi icon={CheckCircle2} value={totals.normal} label="Normais" detail="Operando dentro da faixa" tone="ok"/>
        <Kpi icon={AlertTriangle} value={totals.warning} label="Em atenção" detail="Próximas ao limite" tone="warn"/>
        <Kpi icon={AlertTriangle} value={totals.critical} label="Críticas" detail={totals.offline?`${totals.offline} offline`:"Exigem intervenção"} tone="alert"/>
      </div>

      {totals.critical>0&&<button onClick={()=>{const c=visible.find(x=>getStatus(x,latest[x.id])==="critical");if(c)nav(`/system/${c.id}`)}} className="flex w-full items-center gap-4 rounded-xl border border-status-alert/30 bg-status-alert/10 p-4 text-left transition hover:bg-status-alert/15"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-status-alert/15 text-status-alert"><AlertTriangle className="h-5 w-5"/></span><div className="min-w-0 flex-1"><p className="font-semibold"><span className="text-status-alert">{totals.critical} {totals.critical===1?"alarme crítico ativo":"alarmes críticos ativos"}</span></p><p className="truncate text-sm text-muted-foreground">Temperatura fora da faixa configurada. Verifique a ocorrência.</p></div><span className="hidden items-center gap-2 text-sm font-semibold sm:flex">Ver ocorrência <ArrowRight className="h-4 w-4"/></span></button>}

      {visible.length===0?<Card className="p-12 text-center"><Snowflake className="mx-auto mb-4 h-10 w-10 text-muted-foreground"/><h3 className="font-semibold">Nenhuma câmara encontrada</h3><p className="mt-1 text-sm text-muted-foreground">Cadastre ou selecione outra empresa para começar.</p></Card>:
      
      // Listagem agrupada por localização com acordeão
      <div className="space-y-4">
        {Object.entries(groupedByLocation).map(([locationName, locChambers]) => {
          const isExpanded = expandedLocations[locationName] ?? true;
          return (
            <Card key={locationName} className="overflow-hidden border border-border/60 bg-card/40">
              {/* Cabeçalho do Grupo (Localização) clicável para recolher/expandir */}
              <button 
                onClick={() => toggleLocation(locationName)}
                className="flex w-full items-center justify-between p-4 transition hover:bg-muted/30"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <MapPin className="h-5 w-5" />
                  </span>
                  <div className="text-left">
                    <h3 className="text-base font-bold">{locationName}</h3>
                    <p className="text-xs text-muted-foreground">{locChambers.length} {locChambers.length === 1 ? 'equipamento vinculado' : 'equipamentos vinculados'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span className="text-xs font-semibold">{isExpanded ? "Recolher" : "Expandir"}</span>
                  {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                </div>
              </button>

              {/* Grid de Cards dos Freezers daquela localização */}
              {isExpanded && (
                <div className="grid gap-4 p-4 pt-0 md:grid-cols-2 2xl:grid-cols-3">
                  {locChambers.map(ch => (
                    <ChamberCard 
                      key={ch.id} 
                      chamber={ch} 
                      reading={latest[ch.id]} 
                      tenant={tenants.find(t => t.id === ch.tenant_id)} 
                      onClick={() => nav(`/system/${ch.id}`)}
                    />
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>}
    </div>
  </Layout>;
}

function Kpi({icon:Icon,value,label,detail,tone}:{icon:typeof Thermometer;value:number;label:string;detail:string;tone:"info"|"ok"|"warn"|"alert"}){const colors={info:"text-status-info bg-status-info/10",ok:"text-status-ok bg-status-ok/10",warn:"text-status-warn bg-status-warn/10",alert:"text-status-alert bg-status-alert/10"};return <Card className="flex items-center gap-4 p-5"><span className={`flex h-12 w-12 items-center justify-center rounded-xl ${colors[tone]}`}><Icon className="h-6 w-6"/></span><div><div className="sensor-value text-2xl font-bold">{value}</div><div className="text-sm font-semibold">{label}</div><div className="text-[11px] text-muted-foreground">{detail}</div></div></Card>}

function ChamberCard({chamber,reading,tenant,onClick}:{chamber:Chamber;reading?:Reading;tenant?:Tenant;onClick:()=>void}){const status=getStatus(chamber,reading),meta=statusMeta[status],temp=reading?Number(reading.temperature):null;return <Card onClick={onClick} className="group cursor-pointer overflow-hidden p-0 transition duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-2xl hover:shadow-black/20"><div className={`h-1 w-full ${meta.dot}`}/><div className="p-5">
  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-[10px] font-bold uppercase tracking-[.15em] text-muted-foreground">{tenant?.name||"Empresa vinculada"}</p><h3 className="mt-1 truncate text-lg font-bold">{chamber.name}</h3><p className="truncate text-xs text-muted-foreground">{chamber.location||"Localização não informada"}</p></div><span className={`flex shrink-0 items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold ${meta.text}`}><span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`}/>{meta.label}</span></div>
  <div className="my-6 text-center"><div className={`sensor-value text-5xl font-bold tracking-tight ${meta.text}`}>{temp!==null?temp.toFixed(1):"—"}<span className="ml-1 text-lg text-muted-foreground">°C</span></div><p className="mt-2 text-xs text-muted-foreground">Faixa permitida <span className="sensor-value ml-1 rounded bg-secondary px-2 py-1 text-foreground">{Number(chamber.min_temp).toFixed(0)} a {Number(chamber.max_temp).toFixed(0)} °C</span></p></div>
  <div className="grid grid-cols-3 border-y border-border py-4 text-xs"><State icon={Power} label="Compressor" value={reading?.compressor_on?"Ligado":"Desligado"} active={reading?.compressor_on}/><State icon={DoorClosed} altIcon={DoorOpen} label="Porta" value={reading?.door_open?"Aberta":"Fechada"} active={!reading?.door_open} alert={reading?.door_open}/><State icon={Snowflake} label="Degelo" value={reading?.defrost_on?"Ativo":"Inativo"} info={reading?.defrost_on}/></div>
  <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground"><span>{reading?`Atualizado ${new Date(reading.recorded_at).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}`:"Sem telemetria"}</span><span className="flex items-center gap-1 font-semibold text-foreground transition group-hover:text-primary">Ver detalhes <ArrowRight className="h-3.5 w-3.5"/></span></div>
  </div></Card>}

function State({icon:Icon,altIcon:Alt,label,value,active,alert,info}:{icon:typeof Power;altIcon?:typeof DoorOpen;label:string;value:string;active?:boolean;alert?:boolean;info?:boolean}){const I=alert&&Alt?Alt:Icon;const color=alert?"text-status-alert":info?"text-status-info":active?"text-status-ok":"text-muted-foreground";return <div className="flex flex-col items-center gap-1 border-r border-border last:border-0"><I className={`h-4 w-4 ${color}`}/><span className="text-[10px] text-muted-foreground">{label}</span><span className={`font-semibold ${color}`}>{value}</span></div>}