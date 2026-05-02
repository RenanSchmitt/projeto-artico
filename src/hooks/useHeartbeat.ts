import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const HEARTBEAT_THRESHOLD_MS = 5 * 60 * 1000;

export function useHeartbeat(chamberId?: string) {
  const [lastSeen, setLastSeen] = useState<Date | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function fetchLast() {
      const q = supabase.from("telemetry").select("recorded_at").order("recorded_at", { ascending: false }).limit(1);
      if (chamberId) q.eq("chamber_id", chamberId);
      const { data } = await q;
      if (!cancelled) setLastSeen(data?.[0] ? new Date(data[0].recorded_at) : null);
    }
    fetchLast();
    const i = setInterval(fetchLast, 10_000);
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => {
      cancelled = true;
      clearInterval(i);
      clearInterval(t);
    };
  }, [chamberId]);

  const ageMs = lastSeen ? Date.now() - lastSeen.getTime() : Infinity;
  const offline = ageMs > HEARTBEAT_THRESHOLD_MS;
  return { lastSeen, ageMs, offline, tick };
}

export function formatAge(ms: number) {
  if (!isFinite(ms)) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s atrás`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}min atrás`;
  const h = Math.floor(m / 60);
  return `${h}h atrás`;
}
