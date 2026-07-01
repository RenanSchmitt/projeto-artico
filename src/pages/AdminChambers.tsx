import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { Trash2, Shield, Building, Cpu, ArrowLeft, Copy, Check, Pencil, X } from "lucide-react";

type Tenant = { id: string; name: string };
type Chamber = { 
  id: string; 
  name: string; 
  location: string | null; 
  tenant_id: string; 
  setpoint: number; 
  min_temp: number; 
  max_temp: number; 
};

export default function AdminChamberManager() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [chambers, setChambers] = useState<Chamber[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  // 🔄 Estado de controle: se tiver uma ID aqui, estamos editando. Se for null, estamos cadastrando.
  const [editingChamberId, setEditingChamberId] = useState<string | null>(null);

  // Controle de Modo Virtual (Simulado) ou Real (Hardware)
  const [isVirtualMode, setIsVirtualMode] = useState<boolean>(true);

  // Estados do formulário de cadastro / edição
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [setpoint, setSetpoint] = useState("-18.0");
  const [minTemp, setMinTemp] = useState("-22.0");
  const [maxTemp, setMaxTemp] = useState("-15.0");

  useEffect(() => {
    fetchData();
    fetchSystemMode();
  }, []);

  async function fetchData() {
    try {
      const [{ data: tsData }, { data: chsData }] = await Promise.all([
        supabase.from("tenants").select("id, name").order("name"),
        supabase.from("chambers").select("*").order("name")
      ]);
      
      if (tsData) setTenants(tsData);
      if (chsData) setChambers(chsData);
    } catch (err) {
      console.error("Erro ao carregar dados do admin:", err);
    }
  }

  async function fetchSystemMode() {
    try {
      const { data } = await supabase.from("system_settings").select("value").eq("key", "simulation_mode").maybeSingle();
      if (data) {
        setIsVirtualMode(data.value === "true");
      }
    } catch (err) {
      console.log("Usando estado local para simulação.");
    }
  }

  const handleToggleMode = async (checked: boolean) => {
    setIsVirtualMode(checked);
    try {
      await supabase.from("system_settings").upsert({ key: "simulation_mode", value: String(checked) });
      toast({
        title: checked ? "Modo Virtual Ativo" : "Modo Real Ativo",
        description: checked 
          ? "O sistema agora está a gerar dados simulados automaticamente." 
          : "O sistema agora está a aguardar leituras reais do hardware (ESP32).",
      });
    } catch (err) {
      toast({
        title: checked ? "Modo Virtual (Local)" : "Modo Real (Local)",
        description: "Modo alterado na interface.",
      });
    }
  };

  // 🛠️ Ativa o Modo de Edição no formulário jogando os dados da linha nos inputs
  const startEdit = (ch: Chamber) => {
    setEditingChamberId(ch.id);
    setName(ch.name);
    setLocation(ch.location || "");
    setSelectedTenantId(ch.tenant_id);
    setSetpoint(String(ch.setpoint));
    setMinTemp(String(ch.min_temp));
    setMaxTemp(String(ch.max_temp));

    // Scroll suave para o formulário no topo para facilitar a experiência do usuário
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ❌ Cancela a Edição e limpa os campos para o padrão de cadastro
  const cancelEdit = () => {
    setEditingChamberId(null);
    setName("");
    setLocation("");
    setSelectedTenantId("");
    setSetpoint("-18.0");
    setMinTemp("-22.0");
    setMaxTemp("-15.0");
  };

  // 🚀 Gerencia o envio único (Criação ou Atualização)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !selectedTenantId) {
      toast({
        title: "Erro de validação",
        description: "Por favor, insira o nome da câmara e selecione um cliente.",
        variant: "destructive",
      });
      return;
    }

    if (Number(minTemp) >= Number(maxTemp)) {
      toast({
        title: "Erro operacional",
        description: "A temperatura mínima não pode ser maior ou igual à máxima.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      if (editingChamberId) {
        // Modo Edição: Faz UPDATE no banco
        const { error } = await supabase
          .from("chambers")
          .update({
            name: name,
            location: location || null,
            tenant_id: selectedTenantId,
            setpoint: Number(setpoint),
            min_temp: Number(minTemp),
            max_temp: Number(maxTemp),
          })
          .eq("id", editingChamberId);

        if (error) throw error;

        toast({
          title: "Parâmetros Atualizados!",
          description: `A câmara "${name}" teve suas configurações salvas com sucesso.`,
        });
      } else {
        // Modo Cadastro: Faz INSERT no banco
        const { error } = await supabase.from("chambers").insert([
          {
            name: name,
            location: location || null,
            tenant_id: selectedTenantId,
            setpoint: Number(setpoint),
            min_temp: Number(minTemp),
            max_temp: Number(maxTemp),
          },
        ]);

        if (error) throw error;

        toast({
          title: "Sucesso!",
          description: `A câmara "${name}" foi vinculada ao cliente com sucesso.`,
        });
      }

      cancelEdit();
      fetchData();
    } catch (err: any) {
      console.error(err);
      toast({
        title: editingChamberId ? "Erro ao atualizar" : "Erro ao criar câmara",
        description: err.message || "Erro no banco de dados.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteChamber = async (id: string, chamberName: string) => {
    if (!confirm(`Tem certeza que deseja apagar permanentemente a câmara "${chamberName}"?`)) {
      return;
    }
    try {
      const { error } = await supabase.from("chambers").delete().eq("id", id);
      if (error) throw error;
      toast({
        title: "Câmara removida",
        description: `A câmara "${chamberName}" foi excluída com sucesso.`,
      });
      if (editingChamberId === id) cancelEdit();
      fetchData();
    } catch (err: any) {
      console.error(err);
      toast({
        title: "Erro ao excluir",
        description: err.message || "Não foi possível remover a câmara.",
        variant: "destructive",
      });
    }
  };

  const copyToClipboard = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    toast({
      title: "Copiado!",
      description: "ID da câmara copiado para configurar no ESP32.",
    });
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      
      {/* BOTÃO VOLTAR */}
      <div className="flex items-center justify-start">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => navigate("/")}
          className="gap-2 font-semibold"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar ao Painel
        </Button>
      </div>

      {/* CONTROLE GLOBAL: VIRTUAL VS REAL */}
      <Card className="border-border bg-card overflow-hidden relative">
        <div className={`absolute top-0 left-0 w-1.5 h-full ${isVirtualMode ? 'bg-amber-500' : 'bg-emerald-500'}`} />
        <CardContent className="p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-lg ${isVirtualMode ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
              <Cpu className="w-6 h-6" />
            </div>
            <div>
              <h2 className="font-bold text-lg tracking-wide uppercase">Ambiente de Operação</h2>
              <p className="text-xs text-muted-foreground">
                Defina se o painel opera com telemetrias simuladas em nuvem ou via hardware físico.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 bg-muted/50 px-4 py-2.5 rounded-xl border border-border">
            <span className={`text-xs font-bold uppercase tracking-wider ${!isVirtualMode ? 'text-emerald-500' : 'text-muted-foreground'}`}>
              Hardware Real
            </span>
            <Switch 
              checked={isVirtualMode} 
              onCheckedChange={handleToggleMode}
              className="data-[state=checked]:bg-amber-500"
            />
            <span className={`text-xs font-bold uppercase tracking-wider ${isVirtualMode ? 'text-amber-500' : 'text-muted-foreground'}`}>
              Simulador Virtual
            </span>
          </div>
        </CardContent>
      </Card>

      {/* FORMULÁRIO DE CADASTRO / EDICAO DINÂMICO */}
      <Card className={`border-border bg-card transition-all ${editingChamberId ? 'ring-1 ring-amber-500/50 shadow-md shadow-amber-500/5' : ''}`}>
        <CardHeader>
          <CardTitle className="text-xl font-bold tracking-wide flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className={`w-5 h-5 ${editingChamberId ? "text-amber-500" : "text-primary"}`} /> 
              {editingChamberId ? "EDITAR CONFIGURAÇÕES DA CÂMARA" : "CADASTRAR NOVA CÂMARA"}
            </div>
            {editingChamberId && (
              <Button type="button" variant="ghost" size="sm" onClick={cancelEdit} className="text-muted-foreground hover:text-foreground h-8 px-2">
                <X className="w-4 h-4 mr-1" /> Cancelar Edição
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Cliente / Empresa Destino</label>
              <Select value={selectedTenantId} onValueChange={setSelectedTenantId}>
                <SelectTrigger className="w-full">
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o cliente responsável" />
                  </SelectTrigger>
                </SelectTrigger>
                <SelectContent>
                  {tenants.map((tenant) => (
                    <SelectItem key={tenant.id} value={tenant.id}>
                      {tenant.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Nome da Câmara</label>
                <Input placeholder="Ex: Câmara de Congelados" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Localização / Setor</label>
                <Input placeholder="Ex: Pavilhão A (Opcional)" value={location} onChange={(e) => setLocation(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Setpoint (°C)</label>
                <Input type="number" step="0.1" value={setpoint} onChange={(e) => setSetpoint(e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-status-warn">Temp. Mínima (°C)</label>
                <Input type="number" step="0.1" value={minTemp} onChange={(e) => setMinTemp(e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-status-alert">Temp. Máxima (°C)</label>
                <Input type="number" step="0.1" value={maxTemp} onChange={(e) => setMaxTemp(e.target.value)} />
              </div>
            </div>

            <div className="flex gap-3 mt-2">
              {editingChamberId && (
                <Button type="button" variant="outline" className="w-1/4" onClick={cancelEdit} disabled={loading}>
                  Cancelar
                </Button>
              )}
              <Button type="submit" className={`flex-1 ${editingChamberId ? "bg-amber-600 hover:bg-amber-500 text-white" : ""}`} disabled={loading}>
                {loading ? "Processando..." : editingChamberId ? "Salvar Parâmetros da Câmara" : "Salvar e Vincular Câmara"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* TABELA DE GERENCIAMENTO */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-xl font-bold tracking-wide flex items-center gap-2">
            <Building className="w-5 h-5 text-primary" /> GERENCIAR CÂMARAS ATIVAS ({chambers.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm text-left">
              <thead className="text-xs uppercase bg-muted text-muted-foreground font-bold border-b border-border">
                <tr>
                  <th className="p-4">Cliente Vinculado</th>
                  <th className="p-4">Nome da Câmara</th>
                  <th className="p-4">ID p/ o ESP32 (Hardware)</th>
                  <th className="p-4 text-center">Configurações</th>
                  <th className="p-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {chambers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted-foreground">Nenhuma câmara cadastrada.</td>
                  </tr>
                ) : (
                  chambers.map((ch) => {
                    const client = tenants.find((t) => t.id === ch.tenant_id);
                    const isRowEditing = editingChamberId === ch.id;
                    return (
                      <tr key={ch.id} className={`transition-colors ${isRowEditing ? 'bg-amber-500/10 hover:bg-amber-500/15' : 'hover:bg-muted/40'}`}>
                        <td className="p-4 font-semibold text-primary">{client ? client.name : "⚠️ Sem Empresa"}</td>
                        <td className="p-4 font-bold">
                          {ch.name}
                          {ch.location && <span className="block text-xs font-normal text-muted-foreground">{ch.location}</span>}
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-2 bg-muted/60 px-2 py-1 rounded border border-border max-w-[220px]">
                            <span className="text-xs font-mono truncate text-muted-foreground">{ch.id}</span>
                            <Button 
                              type="button"
                              variant="ghost" 
                              size="icon" 
                              className="w-6 h-6 shrink-0" 
                              onClick={() => copyToClipboard(ch.id)}
                            >
                              {copiedId === ch.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                            </Button>
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground">
                            <span>Set: <strong className="text-foreground">{ch.setpoint}°C</strong></span>
                            <span>Min: <strong className="text-foreground">{ch.min_temp}°C</strong></span>
                            <span>Max: <strong className="text-foreground">{ch.max_temp}°C</strong></span>
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center justify-center gap-2">
                            {/* ✏️ BOTÃO EDITAR INJETADO */}
                            <Button 
                              variant="outline" 
                              size="icon" 
                              className={`w-8 h-8 rounded-md ${isRowEditing ? 'border-amber-500 text-amber-500 bg-amber-500/10' : ''}`}
                              onClick={() => startEdit(ch)}
                              title="Editar câmara"
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button variant="destructive" size="icon" className="w-8 h-8 rounded-md" onClick={() => handleDeleteChamber(ch.id, ch.name)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}