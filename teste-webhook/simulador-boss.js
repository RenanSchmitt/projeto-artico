const SUPABASE_URL = "https://vpmukocqdtljdxqndwts.supabase.co/rest/v1";
const API_KEY = "sb_publishable__ou8zAv4B5X1J08x4BaMVA_tSaJ7Zz9";

const headers = {
  "apikey": API_KEY,
  "Authorization": `Bearer ${API_KEY}`,
  "Content-Type": "application/json"
};

// Busca o ID da câmara atrelando ao Tenant correto que vimos na foto
async function obterIdDaCamara() {
  try {
    // Adicionamos o filtro do tenant_id para garantir que o banco retorne a câmara
    const url = `${SUPABASE_URL}/chambers?tenant_id=eq.11111111-1111-1111-1111-111111111111&select=id,name&limit=1`;
    const response = await fetch(url, { headers });
    const camaras = await response.json();
    
    if (camaras && camaras.length > 0) {
      return camaras[0];
    }
    return null;
  } catch (error) {
    console.error("❌ Erro ao conectar na nuvem para buscar ID:", error.message);
    return null;
  }
}

async function iniciarBossCarelReal() {
  console.log("🤖 [Firmware Carel v3.4] Inicializando comunicação de borda...");
  
  const camaraAtiva = await obterIdDaCamara();

  if (!camaraAtiva) {
    console.log("⚠️ Erro de sincronismo. Nenhuma câmara encontrada para o tenant informado.");
    console.log("Certifique-se de que rodou o INSERT da câmara no SQL Editor com o tenant correto!");
    return;
  }

  console.log(`\n✅ Conectado com sucesso ao ativo: ${camaraAtiva.name}`);
  console.log(`📡 Dispositivo conectado ao barramento RS485. Enviando dados nativos...`);
  console.log("----------------------------------------------------------------\n");

  // O loop que vai efetivamente metralhar os dados na tabela do seu print
  setInterval(async () => {
    const temp = (1.8 + Math.random() * 1.5).toFixed(1);
    const press = (2.0 + Math.random() * 0.2).toFixed(1);

    const payloadCarelBoss = {
      "device_id": `boss_mpxpro_${camaraAtiva.id.substring(0,8)}`, 
      "timestamp": new Date().toISOString(),
      "variables": [
        { "id": "1", "name": "Cabinet Temperature", "value": temp, "unit": "°C" },
        { "id": "2", "name": "Suction Pressure", "value": press, "unit": "bar" },
        { "id": "3", "name": "Compressor Relay", "value": "1", "unit": "" }
      ]
    };

    console.log(`[Carel Webhook] Transmitindo Variáveis... Temp: ${temp}°C`);

    try {
      const response = await fetch(`${SUPABASE_URL}/telemetry_carel_raw`, {
        method: "POST",
        headers: { ...headers, "Prefer": "return=minimal" },
        body: JSON.stringify({
          chamber_id: camaraAtiva.id,
          raw_json: payloadCarelBoss 
        })
      });

      if (response.ok) {
        console.log("🚀 Dado gravado no Supabase com sucesso!");
      } else {
        const txtErro = await response.text();
        console.log(`❌ Erro do Supabase (${response.status}):`, txtErro);
      }
    } catch (err) {
      console.error("❌ Falha na portadora de rede:", err.message);
    }
  }, 5000); // Roda de 5 em 5 segundos
}

iniciarBossCarelReal();