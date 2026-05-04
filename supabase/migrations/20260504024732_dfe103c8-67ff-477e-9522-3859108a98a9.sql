-- Add advanced refrigeration telemetry columns
ALTER TABLE public.telemetry
  ADD COLUMN IF NOT EXISTS suction_pressure numeric,
  ADD COLUMN IF NOT EXISTS evaporation_pressure numeric,
  ADD COLUMN IF NOT EXISTS superheat numeric,
  ADD COLUMN IF NOT EXISTS subcooling numeric,
  ADD COLUMN IF NOT EXISTS condensation_temp numeric,
  ADD COLUMN IF NOT EXISTS eev_opening numeric,
  ADD COLUMN IF NOT EXISTS eev_steps integer;