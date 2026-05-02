
-- Roles enum
CREATE TYPE public.app_role AS ENUM ('admin', 'client');

-- Tenants (mercados / açougues)
CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  city text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- User roles (separate table — security best practice)
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);

-- Chambers (câmaras frias)
CREATE TABLE public.chambers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  location text,
  setpoint numeric NOT NULL DEFAULT -18,
  min_temp numeric NOT NULL DEFAULT -22,
  max_temp numeric NOT NULL DEFAULT -15,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Telemetry readings
CREATE TABLE public.telemetry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chamber_id uuid NOT NULL REFERENCES public.chambers(id) ON DELETE CASCADE,
  temperature numeric NOT NULL,
  compressor_on boolean NOT NULL DEFAULT false,
  defrost_on boolean NOT NULL DEFAULT false,
  door_open boolean NOT NULL DEFAULT false,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_telemetry_chamber_time ON public.telemetry (chamber_id, recorded_at DESC);

-- Alarms
CREATE TABLE public.alarms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chamber_id uuid NOT NULL REFERENCES public.chambers(id) ON DELETE CASCADE,
  severity text NOT NULL DEFAULT 'warning',
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_alarms_chamber_time ON public.alarms (chamber_id, created_at DESC);

-- Security definer functions
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid();
$$;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Enable RLS
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chambers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telemetry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alarms ENABLE ROW LEVEL SECURITY;

-- Tenants policies
CREATE POLICY "Admins view all tenants" ON public.tenants FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Clients view own tenant" ON public.tenants FOR SELECT
  USING (id = public.current_tenant_id());

-- Profiles policies
CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE
  USING (id = auth.uid());

-- user_roles policies
CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Chambers policies
CREATE POLICY "Admins view all chambers" ON public.chambers FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Clients view own chambers" ON public.chambers FOR SELECT
  USING (tenant_id = public.current_tenant_id());

-- Telemetry policies
CREATE POLICY "Admins view all telemetry" ON public.telemetry FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Clients view own telemetry" ON public.telemetry FOR SELECT
  USING (chamber_id IN (SELECT id FROM public.chambers WHERE tenant_id = public.current_tenant_id()));
CREATE POLICY "Authenticated insert telemetry" ON public.telemetry FOR INSERT
  TO authenticated WITH CHECK (true);

-- Alarms policies
CREATE POLICY "Admins view all alarms" ON public.alarms FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Clients view own alarms" ON public.alarms FOR SELECT
  USING (chamber_id IN (SELECT id FROM public.chambers WHERE tenant_id = public.current_tenant_id()));
CREATE POLICY "Authenticated insert alarms" ON public.alarms FOR INSERT
  TO authenticated WITH CHECK (true);
