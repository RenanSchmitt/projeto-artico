// Generates a fresh telemetry reading for every chamber. Called by the frontend on a timer.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: chambers } = await supabase.from("chambers").select("*");
  if (!chambers) return new Response(JSON.stringify({ inserted: 0 }), { headers: corsHeaders });

  const { data: lastReadings } = await supabase
    .from("telemetry")
    .select("chamber_id, temperature, compressor_on")
    .order("recorded_at", { ascending: false })
    .limit(chambers.length * 2);

  const lastByChamber = new Map<string, any>();
  for (const r of lastReadings ?? []) {
    if (!lastByChamber.has(r.chamber_id)) lastByChamber.set(r.chamber_id, r);
  }

  const newRows: any[] = [];
  const newAlarms: any[] = [];
  for (const ch of chambers) {
    const last = lastByChamber.get(ch.id);
    const sp = Number(ch.setpoint);
    const lastTemp = last ? Number(last.temperature) : sp;
    const compressorWas = last?.compressor_on ?? false;

    // physics-ish: compressor pulls temp down, otherwise rises
    const delta = compressorWas ? -0.4 - Math.random() * 0.3 : 0.3 + Math.random() * 0.4;
    let temp = lastTemp + delta + (Math.random() - 0.5) * 0.2;

    const compressor_on = temp > sp + 0.5 ? true : temp < sp - 0.5 ? false : compressorWas;
    const door_open = Math.random() < 0.04;
    const defrost_on = Math.random() < 0.02;

    newRows.push({
      chamber_id: ch.id,
      temperature: Number(temp.toFixed(2)),
      compressor_on,
      defrost_on,
      door_open,
    });

    if (temp > Number(ch.max_temp)) {
      newAlarms.push({
        chamber_id: ch.id,
        severity: "critical",
        message: `Temperatura ${temp.toFixed(1)}°C acima do limite (${ch.max_temp}°C)`,
      });
    } else if (temp < Number(ch.min_temp)) {
      newAlarms.push({
        chamber_id: ch.id,
        severity: "warning",
        message: `Temperatura ${temp.toFixed(1)}°C abaixo do limite (${ch.min_temp}°C)`,
      });
    }
  }

  await supabase.from("telemetry").insert(newRows);
  if (newAlarms.length) await supabase.from("alarms").insert(newAlarms);

  return new Response(
    JSON.stringify({ inserted: newRows.length, alarms: newAlarms.length }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
