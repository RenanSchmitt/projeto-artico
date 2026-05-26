import React, { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const Bancada = () => {
  const [temperature, setTemperature] = useState<number>(2.5);
  const [pressure, setPressure] = useState<number>(2.1);
  const [eevSteps, setEevSteps] = useState<number>(150);
  const [compressor, setCompressor] = useState<boolean>(true);
  const [enviando, setEnviando] = useState<boolean>(false);

  // ID da sua câmara ativa no banco
  const CHAMBER_ID = "5bccad5d-3606-4d00-bb33-0f8ba28daa09"; 

  const enviarDados = async (tempVal = temperature, pressVal = pressure, eevVal = eevSteps, compVal = compressor) => {
    setEnviando(true);
    
    // 1. Envia a telemetria para a tabela do Supabase
    const { error } = await supabase.from("telemetry").insert([
      {
        chamber_id: CHAMBER_ID,
        temperature: tempVal,
        suction_pressure: pressVal,
        eev_steps: eevVal,
        compressor_on: compVal,
      },
    ]);

    setEnviando(false);

    if (error) {
      toast.error("Erro ao injetar telemetria: " + error.message);
    } else {
      toast.success(`Telemetria Real enviada! (${tempVal}°C / ${pressVal} bar)`);

      // 2. DISPARO DO PUSH SE A TEMPERATURA SUBIR (Ex: maior que 5.0°C)
      if (tempVal > 5.0) {
        const messageText = `⚠️ ALERTA CRÍTICO: Câmara de Salmão Real atingiu ${tempVal.toFixed(1)}°C!`;
        
        fetch("https://onesignal.com/api/v1/notifications", {
          method: "POST",
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Authorization": "Basic kffxmmodgexrvtl2kmsidljmk" // Sua Rest API Key do OneSignal
          },
          body: JSON.stringify({
            app_id: "f72d6a18-1a19-48c9-b886-e023d2c49bcb", // Seu App ID do OneSignal
            included_segments: ["All Users"],
            contents: { en: messageText, pt: messageText },
            headings: { en: "FRIOCTRL - Alerta Técnico", pt: "FRIOCTRL - Alerta Técnico" }
          })
        })
        .then((res) => res.json())
        .then((data) => console.log("Push OneSignal enviado com sucesso:", data))
        .catch((err) => console.error("Erro ao disparar push do front:", err));
      }
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-2xl space-y-6">
        <div>
          <h1 className="text-xl font-bold text-emerald-400">FrioCtrl — Simulador de Hardware</h1>
          <p className="text-sm text-zinc-400">Controle manual para apresentação em tempo real</p>
        </div>

        {/* CONTROLE DE TEMPERATURA */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm font-medium">
            <span className="text-zinc-300">Temperatura Ambiente</span>
            <span className="text-emerald-400 font-bold">{temperature.toFixed(1)} °C</span>
          </div>
          <input
            type="range"
            min="-30"
            max="40"
            step="0.1"
            value={temperature}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              setTemperature(val);
              enviarDados(val, pressure, eevSteps, compressor);
            }}
            className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
          />
        </div>

        {/* CONTROLE DE PRESSÃO */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm font-medium">
            <span className="text-zinc-300">Pressão de Sucção</span>
            <span className="text-blue-400 font-bold">{pressure.toFixed(1)} bar</span>
          </div>
          <input
            type="range"
            min="0"
            max="10"
            step="0.1"
            value={pressure}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              setPressure(val);
              enviarDados(temperature, val, eevSteps, compressor);
            }}
            className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
        </div>

        {/* CONTROLE DA VÁLVULA EEV */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm font-medium">
            <span className="text-zinc-300">Abertura Válvula EEV</span>
            <span className="text-amber-400 font-bold">{eevSteps} Steps</span>
          </div>
          <input
            type="range"
            min="0"
            max="480"
            step="5"
            value={eevSteps}
            onChange={(e) => {
              const val = parseInt(e.target.value);
              setEevSteps(val);
              enviarDados(temperature, pressure, val, compressor);
            }}
            className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
          />
        </div>

        {/* STATUS DO COMPRESSOR */}
        <div className="flex items-center justify-between bg-zinc-950 p-4 rounded-lg border border-zinc-800">
          <span className="text-sm text-zinc-300 font-medium">Compressor de Refrigeração</span>
          <button
            onClick={() => {
              const next = !compressor;
              setCompressor(next);
              enviarDados(temperature, pressure, eevSteps, next);
            }}
            className={`px-4 py-1.5 rounded-md font-bold text-xs transition-colors ${
              compressor ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-red-500/20 text-red-400 border border-red-500/30"
            }`}
          >
            {compressor ? "LIGADO (ON)" : "DESLIGADO (OFF)"}
          </button>
        </div>

        <button
          onClick={() => enviarDados()}
          disabled={enviando}
          className="w-full py-2.5 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-sm font-semibold rounded-lg border border-zinc-700 transition-colors"
        >
          {enviando ? "Disparando..." : "Forçar Envio Manual"}
        </button>
      </div>
    </div>
  );
};

export default Bancada;