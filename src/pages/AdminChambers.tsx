import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Chamber {
  id: string;
  name: string;
  connection_type: 'virtual' | 'real';
  device_address: string | null;
  created_at: string;
}

const AdminChambers = () => {
  const [chambers, setChambers] = useState<Chamber[]>([]);
  const [name, setName] = useState("");
  const [connectionType, setConnectionType] = useState<'virtual' | 'real'>("virtual");
  const [deviceAddress, setDeviceAddress] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchChambers = async () => {
    const { data, error } = await supabase
      .from("chambers")
      .select("id, name, connection_type, device_address, created_at")
      .order("created_at", { ascending: false });
    
    if (!error && data) setChambers(data as Chamber[]);
  };

  useEffect(() => {
    fetchChambers();
  }, []);

  const handleCreateChamber = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error("Insira o nome da câmara");

    setLoading(true);
    const { data, error } = await supabase
      .from("chambers")
      .insert([
        {
          name: name,
          connection_type: connectionType,
          device_address: connectionType === 'real' ? deviceAddress : 'SIMULADOR_INTERNO',
        },
      ])
      .select();

    setLoading(false);

    if (error) {
      toast.error("Erro ao criar câmara: " + error.message);
    } else {
      toast.success("Câmara cadastrada com sucesso!");
      setName("");
      setDeviceAddress("");
      fetchChambers();
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Painel Administrativo FrioCtrl</h1>
          <p className="text-sm text-zinc-400">Gerenciamento de Infraestrutura e Dispositivos Boss Carel</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* FORMULÁRIO */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 h-fit space-y-4">
            <h2 className="text-lg font-semibold text-emerald-400">Nova Câmara / Ativo</h2>
            
            <form onSubmit={handleCreateChamber} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs text-zinc-400 font-medium">Nome da Câmara</label>
                <input
                  type="text"
                  placeholder="Ex: Câmara de Salmão 02"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-zinc-400 font-medium">Tipo de Conexão</label>
                <select
                  value={connectionType}
                  onChange={(e) => setConnectionType(e.target.value as 'virtual' | 'real')}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
                >
                  <option value="virtual">Bancada Virtual (Simulada)</option>
                  <option value="real">Câmara Real (Boss Carel Webhook)</option>
                </select>
              </div>

              {connectionType === 'real' && (
                <div className="space-y-1">
                  <label className="text-xs text-zinc-400 font-medium">Endereço/ID do Dispositivo no Boss</label>
                  <input
                    type="text"
                    placeholder="Ex: mpxpro_idx_01"
                    value={deviceAddress}
                    onChange={(e) => setDeviceAddress(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 font-semibold text-sm rounded-lg transition-colors text-black"
              >
                {loading ? "Cadastrando..." : "Adicionar Câmara"}
              </button>
            </form>
          </div>

          {/* LISTAGEM E INTEGRAÇÃO */}
          <div className="md:col-span-2 space-y-4">
            <h2 className="text-lg font-semibold text-zinc-300">Câmaras Registradas</h2>
            
            <div className="space-y-3">
              {chambers.map((c) => (
                <div key={c.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-zinc-200">{c.name}</h3>
                      <p className="text-xs text-zinc-500 font-mono mt-0.5">ID do Banco: {c.id}</p>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      c.connection_type === 'real' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    }`}>
                      {c.connection_type === 'real' ? 'Física (Real)' : 'Virtual / Bancada'}
                    </span>
                  </div>

                  {c.connection_type === 'real' && (
                    <div className="bg-zinc-950 p-3.5 rounded-lg border border-zinc-800 text-xs space-y-2 font-mono">
                      <p className="text-zinc-400 font-sans font-semibold text-xs border-b border-zinc-800 pb-1 text-blue-400">
                        ⚙️ CONFIGURAÇÃO DO WEBHOOK NO BOSS CAREL:
                      </p>
                      <p><span className="text-zinc-500">MÉTODO:</span> <span className="text-emerald-400 font-bold">POST</span></p>
                      <p><span className="text-zinc-500">URL:</span> <span className="text-zinc-300 select-all">https://vpmukocqdtljdxqndwts.supabase.co/rest/v1/telemetry</span></p>
                      <p><span className="text-zinc-500">HEADERS:</span></p>
                      <p className="pl-4 text-zinc-400">apikey: sb_publishable__ou8zAv4B5X1J08x4BaMVA_tSaJ7Zz9</p>
                      <p className="pl-4 text-zinc-400">Authorization: Bearer sb_publishable__ou8zAv4B5X1J08x4BaMVA_tSaJ7Zz9</p>
                      <p><span className="text-zinc-500">PAYLOAD JSON (Exemplo de Envio):</span></p>
                      <pre className="bg-zinc-900 p-2 rounded border border-zinc-800 text-zinc-400">
{`{
  "chamber_id": "${c.id}",
  "temperature": 2.5,
  "suction_pressure": 2.1,
  "compressor_on": true
}`}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminChambers;