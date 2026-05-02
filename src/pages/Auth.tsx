import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Snowflake } from "lucide-react";

export default function Auth() {
  const nav = useNavigate();
  const [email, setEmail] = useState("admin@admin.com");
  const [password, setPassword] = useState("admin123");
  const [loading, setLoading] = useState(false);
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) nav("/", { replace: true });
    });
  }, [nav]);

  // Auto-seed on first load (idempotent)
  useEffect(() => {
    setSeeding(true);
    supabase.functions.invoke("seed").finally(() => setSeeding(false));
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Bem-vindo");
      nav("/", { replace: true });
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Card className="w-full max-w-md p-8 border-border bg-card">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-md bg-primary/10 border border-primary/40 flex items-center justify-center pulse-ok">
            <Snowflake className="text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-wide">FRIO<span className="text-primary">CTRL</span></h1>
            <p className="text-xs text-muted-foreground uppercase tracking-widest">Industrial monitoring</p>
          </div>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} required type="email" />
          </div>
          <div className="space-y-2">
            <Label>Senha</Label>
            <Input value={password} onChange={(e) => setPassword(e.target.value)} required type="password" />
          </div>
          <Button type="submit" disabled={loading || seeding} className="w-full">
            {seeding ? "Preparando ambiente..." : loading ? "Entrando..." : "ENTRAR"}
          </Button>
        </form>

        <div className="mt-6 pt-6 border-t border-border text-xs text-muted-foreground space-y-1">
          <div className="uppercase tracking-widest text-[10px] mb-2">Contas de teste</div>
          <div>admin@admin.com / admin123 <span className="text-primary">(admin)</span></div>
          <div>mercado1@teste.com / admin123 <span className="text-primary">(cliente)</span></div>
          <div>mercado2@teste.com / admin123 <span className="text-primary">(cliente)</span></div>
        </div>
      </Card>
    </div>
  );
}
