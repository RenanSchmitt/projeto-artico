## Objetivo

Entregar (1) um script SQL completo e portátil para recriar o schema do monitoramento (`tenants`, `chambers`, `telemetry`, `alarms`, roles e RLS) na sua conta Supabase, e (2) um guia claro de como rodar o simulador de telemetria nessa conta — comparando **Edge Function + Cron** vs **Database Function + pg_cron** com a recomendação final.

---

## Parte 1 — Script SQL (a ser entregue na implementação)

Será um único arquivo `setup.sql` para você colar no SQL Editor do Supabase, contendo:

1. **Enum e tabelas**
   - `app_role` enum (`admin`, `client`)
   - `tenants` (name, city)
   - `chambers` (tenant_id, name, location, setpoint, min_temp, max_temp)
   - `telemetry` com **todas** as colunas:
     - `temperature`, `compressor_on`, `defrost_on`, `door_open`
     - `suction_pressure`, `evaporation_pressure`
     - `superheat`, `subcooling`, `condensation_temp`
     - `eev_opening`, `eev_steps`
     - `recorded_at`
   - `alarms` (chamber_id, severity, message)
   - `profiles` (id ↔ auth.users, tenant_id)
   - `user_roles` (user_id, role)

2. **Índices** úteis: `telemetry(chamber_id, recorded_at desc)`, `alarms(chamber_id, created_at desc)`.

3. **Funções SECURITY DEFINER**: `has_role(uuid, app_role)` e `current_tenant_id()`.

4. **RLS policies** equivalentes às atuais (admin vê tudo, cliente vê só seu tenant).

5. **Trigger `handle_new_user`** para criar `profiles` automaticamente.

6. **Seed mínimo opcional** (2 mercados + 6 câmaras) comentado, para você ativar se quiser.

---

## Parte 2 — Como rodar o simulador na sua conta

Você tem **duas opções viáveis**. Vou entregar as duas, mas recomendo a B.

### Opção A — Edge Function + Cron Job (espelha o que já existe)

Como funciona:
- Você copia o arquivo `supabase/functions/simulate-tick/index.ts` deste projeto para o seu repositório local.
- Faz deploy via Supabase CLI:
  ```
  supabase login
  supabase link --project-ref <SEU_REF>
  supabase functions deploy simulate-tick --no-verify-jwt
  ```
- Agenda execução a cada N segundos/minutos via `pg_cron` + `pg_net`:
  ```sql
  create extension if not exists pg_cron;
  create extension if not exists pg_net;

  select cron.schedule(
    'simulate-tick-10s', '10 seconds',
    $$ select net.http_post(
         url := 'https://<SEU_REF>.supabase.co/functions/v1/simulate-tick',
         headers := '{"Content-Type":"application/json","apikey":"<ANON_KEY>"}'::jsonb
       ); $$
  );
  ```

Prós: lógica em TypeScript, fácil de evoluir.
Contras: dois pontos móveis (Edge + cron), latência de HTTP, mais coisas para configurar.

### Opção B — Database Function + pg_cron (recomendado) ⭐

Como funciona: a mesma lógica do simulador é reescrita em **PL/pgSQL** como `public.simulate_tick()`, e o `pg_cron` chama essa função direto — **sem HTTP, sem Edge Function, sem deploy**.

Vantagens:
- Tudo vive no banco, é "self-contained" e sobrevive a qualquer mudança no front.
- Mais rápido (sem rede) e mais barato (não consome invocações de Edge).
- Mais simples de instalar: roda 100% do SQL Editor.

Vou entregar uma função `simulate_tick()` equivalente, que para cada câmara:
- lê a última leitura
- aplica a mesma física (compressor histerese ±0.5°C, ruído, porta aleatória, degelo)
- calcula pressões, SH, SC, temp. condensação, abertura/steps da EEV (R404A-ish, igual ao TS atual)
- insere em `telemetry` e gera `alarms` quando temp sai dos limites

E o agendamento:
```sql
select cron.schedule('simulate-tick-10s', '10 seconds', $$ select public.simulate_tick(); $$);
```

### O que NÃO funciona bem

- **Trigger puro** (sem cron) não serve: triggers só disparam em INSERT/UPDATE/DELETE, e o simulador precisa rodar **no tempo**, não em resposta a um evento. Por isso o agendador (`pg_cron`) é necessário em ambas as opções.

---

## Entregáveis finais

1. `setup.sql` — schema completo + RLS + funções + (seed opcional comentado).
2. `simulator.sql` — função `simulate_tick()` em PL/pgSQL + agendamento `pg_cron`.
3. `README-migracao.md` curto com:
   - passo-a-passo no SQL Editor,
   - como pegar o `<ANON_KEY>` / `<PROJECT_REF>`,
   - como pausar/remover o cron (`select cron.unschedule('simulate-tick-10s');`),
   - instruções da Opção A (Edge Function) como alternativa, caso prefira manter em TypeScript.

Tudo será salvo em `/mnt/documents/` para você baixar.

## Confirmação

Posso seguir com a **Opção B (Database Function + pg_cron)** como caminho principal e incluir a Opção A apenas como referência no README? Se preferir o contrário (Edge Function como principal), me avise antes de aprovar.