import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, Edit2, Mail, RefreshCw, ShieldCheck, Trash2, UserPlus, Users, X } from "lucide-react";

interface UserProfile { id:string;display_name:string|null;email:string|null;tenant_id:string|null;tenant_name?:string;role:string|null }

export default function AdminUsers(){
  const [users,setUsers]=useState<UserProfile[]>([]),[loading,setLoading]=useState(false);
  const [email,setEmail]=useState(""),[password,setPassword]=useState(""),[username,setUsername]=useState(""),[companyName,setCompanyName]=useState(""),[role,setRole]=useState("viewer");
  const [editingUserId,setEditingUserId]=useState<string|null>(null);

  const fetchUsers=async()=>{setLoading(true);try{const [{data:profiles,error:pErr},{data:tenants,error:tErr}]=await Promise.all([supabase.from("profiles").select("*"),supabase.from("tenants").select("id, name")]);if(pErr)throw pErr;if(tErr)throw tErr;setUsers(profiles?.map(u=>({...u,tenant_name:tenants?.find(t=>t.id===u.tenant_id)?.name||"Sem empresa"}))||[])}catch(err:any){toast.error("Erro ao carregar dados: "+err.message)}finally{setLoading(false)}};
  useEffect(()=>{fetchUsers()},[]);
  const resetForm=()=>{setEditingUserId(null);setEmail("");setPassword("");setUsername("");setCompanyName("");setRole("viewer")};
  const startEdit=(user:UserProfile)=>{setEditingUserId(user.id);setUsername(user.display_name||"");setRole(user.role||"viewer");setCompanyName(user.tenant_name==="Sem empresa"?"":user.tenant_name||"");window.scrollTo({top:0,behavior:"smooth"})};

  const handleCreateOrUpdate=async(e:React.FormEvent)=>{e.preventDefault();if(!username.trim()){toast.error("Informe o nome do usuário.");return}if(!editingUserId&&(!companyName.trim()||!email.trim()||password.length<6)){toast.error("Informe empresa, e-mail e uma senha com pelo menos 6 caracteres.");return}setLoading(true);try{
    if(editingUserId){const {error}=await supabase.from("profiles").update({display_name:username,role}).eq("id",editingUserId);if(error)throw error;toast.success("Usuário atualizado com sucesso!")}
    else{const {data:tenant,error:tenantError}=await supabase.from("tenants").insert({name:companyName}).select().single();if(tenantError)throw tenantError;const {data:auth,error:authError}=await supabase.auth.signUp({email,password,options:{data:{display_name:username,role}}});if(authError)throw authError;if(auth.user){const {error:profileError}=await supabase.from("profiles").update({display_name:username,role,tenant_id:tenant.id}).eq("id",auth.user.id);if(profileError)throw profileError}toast.success("Cliente criado com sucesso!")}
    resetForm();await fetchUsers();
  }catch(err:any){toast.error(err.message||"Não foi possível salvar o usuário.")}finally{setLoading(false)}};

  const deleteUser=async(user:UserProfile)=>{if(!confirm(`Excluir o acesso de "${user.display_name||user.email}"? Essa ação não pode ser desfeita.`))return;try{const {error}=await supabase.from("profiles").delete().eq("id",user.id);if(error)throw error;if(user.tenant_id){const {error:tenantError}=await supabase.from("tenants").delete().eq("id",user.tenant_id);if(tenantError)throw tenantError}toast.success("Usuário removido.");await fetchUsers()}catch(err:any){toast.error(err.message||"Não foi possível excluir o usuário.")}};
  const adminCount=users.filter(u=>u.role==="admin").length;

  return <Layout title="Clientes e usuários" subtitle="Gerencie empresas, acessos e níveis de permissão">
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Summary icon={Users} value={users.length} label="Usuários cadastrados" tone="primary"/>
        <Summary icon={Building2} value={new Set(users.map(u=>u.tenant_id).filter(Boolean)).size} label="Empresas vinculadas" tone="blue"/>
        <Summary icon={ShieldCheck} value={adminCount} label="Administradores" tone="amber"/>
      </div>

      <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
        <Card className={`h-fit overflow-hidden ${editingUserId?"ring-1 ring-yellow-500/50":""}`}>
          <CardHeader className="border-b border-border bg-muted/20">
            <CardTitle className="flex items-center justify-between text-lg"><span className="flex items-center gap-2"><UserPlus className={editingUserId?"h-5 w-5 text-status-warn":"h-5 w-5 text-primary"}/>{editingUserId?"Editar usuário":"Novo cliente"}</span>{editingUserId&&<Button size="icon" variant="ghost" onClick={resetForm}><X className="h-4 w-4"/></Button>}</CardTitle>
            <p className="text-xs text-muted-foreground">{editingUserId?"Atualize o nome e o nível de acesso.":"Crie a empresa e seu primeiro acesso ao FrioCtrl."}</p>
          </CardHeader>
          <CardContent className="pt-5"><form onSubmit={handleCreateOrUpdate} className="space-y-4">
            {!editingUserId&&<Field label="Empresa"><Input placeholder="Ex.: Mercado Central" value={companyName} onChange={e=>setCompanyName(e.target.value)}/></Field>}
            <Field label="Nome do responsável"><Input placeholder="Nome completo" value={username} onChange={e=>setUsername(e.target.value)}/></Field>
            {!editingUserId&&<><Field label="E-mail"><Input type="email" placeholder="responsavel@empresa.com" value={email} onChange={e=>setEmail(e.target.value)}/></Field><Field label="Senha provisória"><Input type="password" placeholder="Mínimo de 6 caracteres" value={password} onChange={e=>setPassword(e.target.value)}/></Field></>}
            <Field label="Nível de acesso"><Select value={role} onValueChange={setRole}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="viewer">Cliente</SelectItem><SelectItem value="admin">Administrador</SelectItem></SelectContent></Select></Field>
            <div className="flex gap-2 pt-2">{editingUserId&&<Button type="button" variant="outline" onClick={resetForm}>Cancelar</Button>}<Button type="submit" className="flex-1" disabled={loading}>{loading?"Processando...":editingUserId?"Salvar alterações":"Criar cliente e acesso"}</Button></div>
          </form></CardContent>
        </Card>

        <Card className="min-w-0 overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between border-b border-border bg-muted/20"><div><CardTitle className="text-lg">Usuários ativos</CardTitle><p className="mt-1 text-xs text-muted-foreground">Acessos cadastrados no ecossistema FrioCtrl</p></div><Button variant="outline" size="icon" onClick={fetchUsers} disabled={loading} title="Atualizar"><RefreshCw className={`h-4 w-4 ${loading?"animate-spin":""}`}/></Button></CardHeader>
          <CardContent className="p-0">
            {users.length===0?<div className="p-12 text-center"><Users className="mx-auto mb-3 h-9 w-9 text-muted-foreground"/><p className="font-semibold">Nenhum usuário encontrado</p><p className="text-sm text-muted-foreground">Cadastre o primeiro cliente no formulário.</p></div>:
            <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-border bg-muted/30 text-[10px] font-bold uppercase tracking-[.12em] text-muted-foreground"><tr><th className="px-5 py-4">Responsável</th><th className="px-5 py-4">Empresa</th><th className="px-5 py-4">Acesso</th><th className="px-5 py-4 text-right">Ações</th></tr></thead><tbody className="divide-y divide-border">{users.map(user=><tr key={user.id} className="transition hover:bg-muted/20"><td className="px-5 py-4"><div className="font-semibold">{user.display_name||"Nome não informado"}</div>{user.email&&<div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Mail className="h-3 w-3"/>{user.email}</div>}</td><td className="px-5 py-4"><span className="font-medium text-primary">{user.tenant_name}</span></td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${user.role==="admin"?"bg-yellow-500/10 text-status-warn":"bg-primary/10 text-primary"}`}>{user.role==="admin"?"Administrador":"Cliente"}</span></td><td className="px-5 py-4"><div className="flex justify-end gap-2"><Button variant="outline" size="icon" className="h-9 w-9" onClick={()=>startEdit(user)} title="Editar"><Edit2 className="h-4 w-4"/></Button><Button variant="outline" size="icon" className="h-9 w-9 border-destructive/30 text-destructive hover:bg-destructive hover:text-white" onClick={()=>deleteUser(user)} title="Excluir"><Trash2 className="h-4 w-4"/></Button></div></td></tr>)}</tbody></table></div>}
          </CardContent>
        </Card>
      </div>
    </div>
  </Layout>;
}

function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="block space-y-2"><span className="text-xs font-semibold text-muted-foreground">{label}</span>{children}</label>}
function Summary({icon:Icon,value,label,tone}:{icon:typeof Users;value:number;label:string;tone:"primary"|"blue"|"amber"}){const colors={primary:"bg-primary/10 text-primary",blue:"bg-blue-500/10 text-status-info",amber:"bg-yellow-500/10 text-status-warn"};return <Card className="flex items-center gap-4 p-5"><span className={`flex h-11 w-11 items-center justify-center rounded-xl ${colors[tone]}`}><Icon className="h-5 w-5"/></span><div><div className="sensor-value text-2xl font-bold">{value}</div><div className="text-sm font-semibold">{label}</div></div></Card>}
