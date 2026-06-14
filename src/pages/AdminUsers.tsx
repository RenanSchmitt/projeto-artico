import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Edit2, ArrowLeft, Users, UserPlus, X, RefreshCw } from "lucide-react";

interface UserProfile {
  id: string;
  display_name: string | null;
  email: string | null;
  tenant_id: string | null;
  tenant_name?: string;
  role: string | null;
}

const AdminUsers = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Estados do formulário
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [role, setRole] = useState("viewer");
  const [editingUserId, setEditingUserId] = useState<string | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data: profiles, error: pErr } = await supabase.from("profiles").select("*");
      const { data: tenants, error: tErr } = await supabase.from("tenants").select("id, name");
      
      if (pErr) throw pErr;

      const mapped = profiles?.map((u) => ({
        ...u,
        tenant_name: tenants?.find((t) => t.id === u.tenant_id)?.name || "Sem empresa"
      }));
      setUsers(mapped || []);
    } catch (err: any) {
      toast.error("Erro ao carregar dados: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleCreateOrUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    // Lógica simplificada de cadastro (ajuste conforme sua necessidade de RLS)
    try {
       // Se for edição, apenas atualiza perfis
       if (editingUserId) {
         await supabase.from("profiles").update({ display_name: username, role }).eq("id", editingUserId);
         toast.success("Atualizado!");
       } else {
         // Fluxo de criação (Tenants -> Auth -> Profiles)
         const { data: tenant } = await supabase.from("tenants").insert({ name: companyName }).select().single();
         const { data: auth } = await supabase.auth.signUp({ email, password, options: { data: { display_name: username, role } } });
         if (auth.user) {
            await supabase.from("profiles").update({ display_name: username, role, tenant_id: tenant.id }).eq("id", auth.user.id);
         }
         toast.success("Criado com sucesso!");
       }
       fetchUsers();
       resetForm();
    } catch (err: any) {
       toast.error(err.message);
    } finally {
       setLoading(false);
    }
  };

  const resetForm = () => {
    setEditingUserId(null);
    setEmail(""); setPassword(""); setUsername(""); setCompanyName(""); setRole("viewer");
  };

  const deleteUser = async (id: string, tenantId: string | null) => {
    if(!confirm("Tem certeza?")) return;
    await supabase.from("profiles").delete().eq("id", id);
    if(tenantId) await supabase.from("tenants").delete().eq("id", tenantId);
    fetchUsers();
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <Button variant="outline" onClick={() => navigate("/")}><ArrowLeft className="mr-2 h-4 w-4"/> Voltar</Button>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Formulário */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader><CardTitle className="text-white">{editingUserId ? "Editar Usuário" : "Novo Cliente"}</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleCreateOrUpdate} className="space-y-4">
              <Input placeholder="Empresa" value={companyName} onChange={e => setCompanyName(e.target.value)} />
              <Input placeholder="Nome" value={username} onChange={e => setUsername(e.target.value)} />
              {!editingUserId && <Input type="email" placeholder="E-mail" value={email} onChange={e => setEmail(e.target.value)} />}
              {!editingUserId && <Input type="password" placeholder="Senha" value={password} onChange={e => setPassword(e.target.value)} />}
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger><SelectValue placeholder="Nível" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Cliente</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
              <Button type="submit" className="w-full" disabled={loading}>Salvar</Button>
            </form>
          </CardContent>
        </Card>

        {/* Tabela */}
        <Card className="md:col-span-2 bg-zinc-900 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-white">EXPANSÃO DO ECOSSISTEMA ({users.length})</CardTitle>
            <Button variant="ghost" onClick={fetchUsers}><RefreshCw/></Button>
          </CardHeader>
          <CardContent>
            <table className="w-full text-zinc-300">
              <thead><tr className="text-left text-xs uppercase border-b border-zinc-800">
                <th className="p-4">Gestor</th><th className="p-4">Tenant</th><th className="p-4">Ações</th>
              </tr></thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-b border-zinc-800">
                    <td className="p-4">{u.display_name}</td>
                    <td className="p-4 text-emerald-400">{u.tenant_name}</td>
                    <td className="p-4 flex gap-2">
                      <Button size="sm" onClick={() => { setEditingUserId(u.id); setUsername(u.display_name || ""); }}><Edit2 size={16}/></Button>
                      <Button size="sm" variant="destructive" onClick={() => deleteUser(u.id, u.tenant_id)}><Trash2 size={16}/></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminUsers;