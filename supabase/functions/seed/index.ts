// Seed users + tenants + chambers + 12h history + alarms
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

  // Idempotent: if admin user already has tenants seeded, just return.
  const { data: existing } = await supabase.from("tenants").select("id").limit(1);
  if (existing && existing.length > 0) {
    return new Response(JSON.stringify({ status: "already_seeded" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 1) Create users
  const accounts = [
    { email: "admin@admin.com", password: "admin123", role: "admin", display: "Administrador", tenantIdx: null as number | null },
    { email: "mercado1@teste.com", password: "admin123", role: "client", display: "Mercado Central", tenantIdx: 0 },
    { email: "mercado2@teste.com", password: "admin123", role: "client", display: "Açougue do Bairro", tenantIdx: 1 },
  ];

  // 2) Create tenants
  const { data: tenants, error: tErr } = await supabase
    .from("tenants")
    .insert([
      { name: "Mercado Central", city: "São Paulo" },
      { name: "Açougue do Bairro", city: "Campinas" },
    ])
    .select();
  if (tErr) return new Response(JSON.stringify({ error: tErr.message }), { status: 500, headers: corsHeaders });

  // Create users (handle "already exists")
  const userIds: Record<string, string> = {};
  for (const acc of accounts) {
    const { data: created, error } = await supabase.auth.admin.createUser({
      email: acc.email,
      password: acc.password,
      email_confirm: true,
      user_metadata: { display_name: acc.display },
    });
    let uid: string | undefined = created?.user?.id;
    if (error || !uid) {
      // try lookup
      const { data: list } = await supabase.auth.admin.listUsers();
      uid = list.users.find((u) => u.email === acc.email)?.id;
    }
    if (!uid) continue;
    userIds[acc.email] = uid;

    await supabase.from("user_roles").upsert({ user_id: uid, role: acc.role }, { onConflict: "user_id,role" });
    const tenantId = acc.tenantIdx !== null ? tenants![acc.tenantIdx].id : null;
    await supabase.from("profiles").upsert({ id: uid, display_name: acc.display, tenant_id: tenantId });
  }

  // 3) Chambers (3 per tenant)
  const chamberDefs = [
    // Mercado Central
    { tenant: 0, name: "Câmara Carnes 01", location: "Setor A", setpoint: -18, min_temp: -22, max_temp: -15 },
    { tenant: 0, name: "Câmara Congelados 02", location: "Setor B", setpoint: -22, min_temp: -25, max_temp: -18 },
    { tenant: 0, name: "Câmara Resfriados 03", location: "Setor C", setpoint: 2, min_temp: 0, max_temp: 6 },
    // Açougue do Bairro
    { tenant: 1, name: "Câmara Bovinos", location: "Fundos", setpoint: -18, min_temp: -22, max_temp: -15 },
    { tenant: 1, name: "Câmara Suínos", location: "Lateral", setpoint: -20, min_temp: -24, max_temp: -16 },
    { tenant: 1, name: "Câmara Aves", location: "Frente", setpoint: -18, min_temp: -22, max_temp: -15 },
  ];

  const { data: chambers } = await supabase
    .from("chambers")
    .insert(chamberDefs.map((c) => ({
      tenant_id: tenants![c.tenant].id,
      name: c.name,
      location: c.location,
      setpoint: c.setpoint,
      min_temp: c.min_temp,
      max_temp: c.max_temp,
    })))
    .select();

  // 4) 12h of telemetry history (1 reading every 5 min = 144 per chamber)
  const now = Date.now();
  const telemetryRows: any[] = [];
  for (const ch of chambers!) {
    const sp = Number(ch.setpoint);
    let temp = sp;
    for (let i = 144; i >= 0; i--) {
      const t = new Date(now - i * 5 * 60 * 1000);
      // sinusoidal drift + noise
      const drift = Math.sin(i / 8) * 1.5 + (Math.random() - 0.5) * 0.6;
      temp = sp + drift;
      const compressor_on = temp > sp + 0.5;
      const defrost_on = i % 36 === 0; // ~ a cada 3h
      const door_open = Math.random() < 0.03;
      telemetryRows.push({
        chamber_id: ch.id,
        temperature: Number(temp.toFixed(2)),
        compressor_on,
        defrost_on,
        door_open,
        recorded_at: t.toISOString(),
      });
    }
  }
  // batch insert
  for (let i = 0; i < telemetryRows.length; i += 500) {
    await supabase.from("telemetry").insert(telemetryRows.slice(i, i + 500));
  }

  // 5) Sample alarms
  const alarmRows: any[] = [];
  for (const ch of chambers!) {
    const samples = [
      { severity: "critical", message: "Temperatura acima do limite superior", offset: 30 },
      { severity: "warning", message: "Porta aberta por mais de 60s", offset: 90 },
      { severity: "info", message: "Ciclo de degelo iniciado", offset: 180 },
      { severity: "warning", message: "Compressor em operação prolongada", offset: 240 },
    ];
    for (const s of samples) {
      alarmRows.push({
        chamber_id: ch.id,
        severity: s.severity,
        message: s.message,
        created_at: new Date(now - s.offset * 60 * 1000).toISOString(),
      });
    }
  }
  await supabase.from("alarms").insert(alarmRows);

  return new Response(
    JSON.stringify({ status: "seeded", tenants: tenants!.length, chambers: chambers!.length, telemetry: telemetryRows.length }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
