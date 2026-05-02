import { Card } from "@/components/ui/card";
import { useHeartbeat, formatAge } from "@/hooks/useHeartbeat";
import { Activity, AlertTriangle } from "lucide-react";

export default function HeartbeatBanner({ chamberId }: { chamberId?: string }) {
  const { lastSeen, ageMs, offline } = useHeartbeat(chamberId);

  if (offline) {
    return (
      <Card className="border-status-alert bg-status-alert/10 p-4 flex items-center gap-3">
        <div className="w-3 h-3 rounded-full pulse-alert" />
        <AlertTriangle className="text-status-alert w-5 h-5" />
        <div>
          <div className="font-bold text-status-alert tracking-wide uppercase text-sm">SISTEMA OFFLINE</div>
          <div className="text-xs text-muted-foreground">
            Verifique a conexão do Boss Carel · último dado {lastSeen ? formatAge(ageMs) : "nunca recebido"}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="border-status-ok/40 bg-card p-4 flex items-center gap-3">
      <div className="w-3 h-3 rounded-full bg-status-ok pulse-ok" />
      <Activity className="text-status-ok w-5 h-5" />
      <div className="flex-1">
        <div className="text-sm font-bold uppercase tracking-wide text-status-ok">Boss Carel · Online</div>
        <div className="text-xs text-muted-foreground">Último heartbeat {formatAge(ageMs)}</div>
      </div>
    </Card>
  );
}
