#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <ArduinoJson.h>
#include <esp_task_wdt.h>

// =========================================================================
// 📌 1. IDENTIFICAÇÃO DO EQUIPAMENTO (ALTERAR AO TROCAR DE ILHA/CÂMARA)
// =========================================================================
const char* CHAMBER_ID = "248613ed-9ae0-4592-8519-032b17f95f22"; 

// =========================================================================
// 📌 2. CONFIGURAÇÕES DA REDE WI-FI LOCAL
// =========================================================================
const char* ssid     = "Koch - BYOD";  
const char* password = "koch@30!20_"; 

// =========================================================================
// 📌 3. CREDENCIAIS DO BANCO DE DADOS (SUPABASE)
// =========================================================================
const char* supabase_base_url = "https://vpmukocqdtljdxqndwts.supabase.co/rest/v1";
const char* supabase_key      = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwbXVrb2NxZHRsamR4cW5kd3RzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3NTM4NDgsImV4cCI6MjA5NTMyOTg0OH0.AEKSUKqtOVgyciUAlmXhN9nHcBtuRt1TykDQII_dtJ0"; 

// =========================================================================
// 📌 4. PARAMETRIZAÇÃO TÉCNICA E CALIBRAÇÃO DE REFRIGERAÇÃO
// =========================================================================
const float OFFSET_FREEZER = -2.0; 
const float HISTERESE_COMPRESSOR = 2.0; 

// =========================================================================
// 📌 5. ESTRUTURA DE DADOS DA ILHA
// =========================================================================
struct Ilha {
  const char* chamber_id;    
  float setPoint;            
  float tempMin;             
  float tempMax;             
  
  int indexSensorFreezer;    
  int indexSensorTuboDegelo; 
  
  float tempAtualFreezer;    
  float tempAtualTuboDegelo; 
  
  bool compressor_on;        
  bool defrost_on;           
};

Ilha ilhas[] = {
  { 
    CHAMBER_ID, 
    -18.0,      
    -22.0,      
    -15.0,      
    1,          
    0,          
    -18.0,      
    20.0,       
    true,       
    false       
  }
};

const int totalIlhas = sizeof(ilhas) / sizeof(ilhas[0]);

// =========================================================================
// 📌 6. PINAGEM DO HARDWARE E TEMPORIZADORES
// =========================================================================
#define ONE_WIRE_BUS 13         
#define WDT_TIMEOUT_SECONDS 15  

OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);

unsigned long ultimoEnvio = 0;
const unsigned long intervaloEnvio = 60000; // 1 MINUTO

unsigned long ultimaBuscaParametros = 0;
const unsigned long intervaloParametros = 5 * 60 * 1000UL; // 5 MINUTOS

unsigned long ultimaLeituraSensores = 0;
const unsigned long intervaloSensores = 15000; // 15 SEGUNDOS

unsigned long ultimaChecagemWiFi = 0;
const unsigned long intervaloChecagemWiFi = 15000; // 15 SEGUNDOS

unsigned long ultimoEnvioSucesso = 0;
const unsigned long TIMEOUT_REINICIO_SEM_COMUNICEACAO = 15 * 60 * 1000UL; // Reboot se ficar 15 MINUTOS sem enviar

// =========================================================================
// 🔄 CONEXÃO E RECONEXÃO WI-FI 100% BLINDADA (PROTEÇÃO CONTRA ESTOURO DE RAM)
// =========================================================================
void checarEConectarWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  // Trava de segurança: Se a RAM estiver crítica, reinicia antes de gastar memória com o rádio
  if (ESP.getFreeHeap() < 40000) {
    Serial.println("\n🚨 [ALERTA DE RAM] Memória baixa (<40KB) ao reconectar Wi-Fi! Reiniciando...");
    delay(500);
    ESP.restart();
  }

  Serial.println("\n⚠️ Wi-Fi desconectado! Tentando reconectar...");
  
  // O parâmetro 'true' desliga o rádio antes de religar, limpando a memória RAM do módulo de RF
  WiFi.disconnect(true); 
  delay(100);
  
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  int tentativas = 0;
  while (WiFi.status() != WL_CONNECTED && tentativas < 15) {
    esp_task_wdt_reset(); 
    delay(500);
    Serial.print(".");
    tentativas++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n🟢 Wi-Fi Conectado!");
    Serial.print("📍 IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\n❌ Falha na reconexão do Wi-Fi. Tentará novamente no próximo ciclo.");
  }
}

// =========================================================================
// 🔄 BUSCA NOVOS SETPOINTS NO SUPABASE (SINTAXE ARDUINOJSON v7)
// =========================================================================
void buscarParametrosSupabase(Ilha &ilha) {
  if (WiFi.status() != WL_CONNECTED) return;

  // TRAVA DE SEGURANÇA 1: Exige no mínimo 50KB livres para alocar SSL com folga
  if (ESP.getFreeHeap() < 50000) {
    Serial.println("⚠️ Memória RAM baixa (<50KB). Busca de parâmetros ignorada temporariamente.");
    return;
  }

  WiFiClientSecure client;
  client.setInsecure(); 

  HTTPClient http;
  String url = String(supabase_base_url) + "/chambers?id=eq." + String(ilha.chamber_id) + "&select=setpoint,min_temp,max_temp";
  
  http.setTimeout(4000); 
  
  if (http.begin(client, url)) {
    http.addHeader("apikey", supabase_key);
    http.addHeader("Authorization", ("Bearer " + String(supabase_key)).c_str());

    int httpCode = http.GET();

    if (httpCode == 200) {
      String payload = http.getString();
      
      // Ajustado para ArduinoJson v7
      JsonDocument doc;
      DeserializationError error = deserializeJson(doc, payload);

      if (!error && doc.is<JsonArray>() && doc.size() > 0) {
        JsonObject obj = doc[0];

        if (obj.containsKey("setpoint") && !obj["setpoint"].isNull()) {
          ilha.setPoint = obj["setpoint"].as<float>();
        }
        if (obj.containsKey("min_temp") && !obj["min_temp"].isNull()) {
          ilha.tempMin = obj["min_temp"].as<float>();
        }
        if (obj.containsKey("max_temp") && !obj["max_temp"].isNull()) {
          ilha.tempMax = obj["max_temp"].as<float>();
        }
      }
    }
    http.end();
  }
  client.stop(); 
}

// =========================================================================
// 📤 ENVIO DE TELEMETRIA PARA A NUVEM (SINTAXE ARDUINOJSON v7)
// =========================================================================
bool enviarTelemetria(Ilha &ilha, int numero_ilha) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("  └─ ⚠️ Envio cancelado: Sem conexão Wi-Fi.");
    return false;
  }

  // TRAVA DE SEGURANÇA 2: Exige no mínimo 50KB livres antes de abrir SSL
  if (ESP.getFreeHeap() < 50000) {
    Serial.println("  └─ ⚠️ Memória RAM insuficiente (<50KB) para abrir conexão SSL.");
    return false;
  }

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  String url = String(supabase_base_url) + "/telemetry";

  // Ajustado para ArduinoJson v7
  JsonDocument doc;
  doc["chamber_id"]           = ilha.chamber_id;
  doc["temperature"]          = serialized(String(ilha.tempAtualFreezer, 1));
  doc["suction_pressure"]     = 1.40;
  doc["evaporation_pressure"] = 1.30;
  doc["superheat"]            = 7.20;
  doc["subcooling"]           = 4.50;
  doc["condensation_temp"]    = 36.80;
  doc["eev_opening"]          = 42.50;
  doc["compressor_on"]        = ilha.compressor_on;
  doc["defrost_on"]           = ilha.defrost_on;

  String jsonDados;
  serializeJson(doc, jsonDados);

  http.setTimeout(5000); 
  bool sucesso = false;

  if (http.begin(client, url)) {
    http.addHeader("Content-Type", "application/json");
    http.addHeader("apikey", supabase_key);
    http.addHeader("Authorization", ("Bearer " + String(supabase_key)).c_str());

    int codigoResposta = http.POST(jsonDados);

    if (codigoResposta == 201 || codigoResposta == 200) {
      Serial.printf("  └─ 🟢 [Ilha %d] Envio Ok! | Freezer: %.1f°C | SetPoint: %.1f°C | Tubo: %.1f°C | Comp: %s | Degelo: %s\n", 
                    numero_ilha, ilha.tempAtualFreezer, ilha.setPoint, ilha.tempAtualTuboDegelo,
                    ilha.compressor_on ? "LIGADO" : "DESLIGADO", 
                    ilha.defrost_on ? "EM DEGELO" : "NORMAL");
      sucesso = true;
    } else {
      Serial.printf("  └─ ❌ [Ilha %d] Erro no envio HTTP: %d\n", numero_ilha, codigoResposta);
    }
    http.end();
  }
  
  client.stop(); 
  return sucesso;
}

// =========================================================================
// 🚀 INICIALIZAÇÃO DO SISTEMA (SETUP)
// =========================================================================
void setup() {
  Serial.begin(115200); 
  delay(1000);

  Serial.println("\n--- FrioCtrl IoT: MONITORAMENTO 100% BLINDADO ---");

  esp_task_wdt_init(WDT_TIMEOUT_SECONDS, true);
  esp_task_wdt_add(NULL); 

  pinMode(ONE_WIRE_BUS, INPUT_PULLUP);
  delay(50);

  sensors.begin();
  sensors.setResolution(10); 
  sensors.setWaitForConversion(true); 

  checarEConectarWiFi();

  unsigned long agora = millis();
  ultimoEnvio = agora;
  ultimaBuscaParametros = agora;
  ultimaLeituraSensores = agora;
  ultimaChecagemWiFi = agora;
  ultimoEnvioSucesso = agora; 
}

// =========================================================================
// 🔄 LOOP PRINCIPAL (EXECUÇÃO ROBUSTA 24/7)
// =========================================================================
void loop() {
  // 🛡️ REBOOT PREVENTIVO SE A RAM CAIR DEMAIS (EVITA CRASH/PANIC)
  if (ESP.getFreeHeap() < 40000) {
    Serial.println("\n🚨 [ALERTA DE MEMÓRIA] RAM crítica (<40KB)! Reiniciando sistema para evitar congelamento...");
    delay(500);
    ESP.restart();
  }

  // Alimenta o Watchdog de Hardware
  esp_task_wdt_reset();

  unsigned long agora = millis();

  // 1. CHECAGEM PREVENTIVA DO WI-FI (A CADA 15 SEGUNDOS)
  if (agora - ultimaChecagemWiFi >= intervaloChecagemWiFi) {
    ultimaChecagemWiFi = agora;
    checarEConectarWiFi();
  }

  // 2. BUSCA DE NOVOS PARÂMETROS NO SUPABASE (A CADA 5 MINUTOS)
  if (agora - ultimaBuscaParametros >= intervaloParametros) {
    if (WiFi.status() == WL_CONNECTED) {
      ultimaBuscaParametros = agora;
      Serial.println("\n🔄 [SYNC] Sincronizando parâmetros com o Supabase...");
      for (int i = 0; i < totalIlhas; i++) {
        buscarParametrosSupabase(ilhas[i]);
      }
    }
  }

  // 3. LEITURA E FILTRAGEM DOS SENSORES (A CADA 15 SEGUNDOS)
  if (agora - ultimaLeituraSensores >= intervaloSensores) {
    ultimaLeituraSensores = agora;
    sensors.requestTemperatures(); 

    for (int i = 0; i < totalIlhas; i++) {
      float rawFreezer = sensors.getTempCByIndex(ilhas[i].indexSensorFreezer);
      float rawTubo    = sensors.getTempCByIndex(ilhas[i].indexSensorTuboDegelo);

      if (rawFreezer != DEVICE_DISCONNECTED_C && rawFreezer != 85.0) {
        ilhas[i].tempAtualFreezer = rawFreezer + OFFSET_FREEZER;
      } else {
        Serial.println("⚠️ [Ruído] Leitura incorreta no Freezer ignorada.");
      }

      if (rawTubo != DEVICE_DISCONNECTED_C && rawTubo != 85.0) {
        ilhas[i].tempAtualTuboDegelo = rawTubo;
      } else {
        Serial.println("⚠️ [Ruído] Leitura incorreta no Tubo ignorada.");
      }

      ilhas[i].defrost_on = (ilhas[i].tempAtualTuboDegelo > 33.0 && ilhas[i].tempAtualTuboDegelo <= 80.0);

      if (ilhas[i].tempAtualFreezer <= ilhas[i].setPoint) {
        ilhas[i].compressor_on = false;
      } 
      else if (ilhas[i].tempAtualFreezer >= (ilhas[i].setPoint + HISTERESE_COMPRESSOR)) {
        ilhas[i].compressor_on = true;
      }
    }
  }

  // 4. ENVIO DA TELEMETRIA PARA A NUVEM (A CADA 1 MINUTO)
  if (agora - ultimoEnvio >= intervaloEnvio) {
    ultimoEnvio = agora;

    Serial.println("\n--------------------------------------------------");
    bool peloMenosUmEnviado = false;

    if (WiFi.status() == WL_CONNECTED) {
      for (int i = 0; i < totalIlhas; i++) {
        if (enviarTelemetria(ilhas[i], i + 1)) {
          peloMenosUmEnviado = true;
        }
      }
    } else {
      Serial.println("⚠️ Sem Wi-Fi. Tentativa de envio ignorada.");
    }

    if (peloMenosUmEnviado) {
      ultimoEnvioSucesso = agora;
    }
    Serial.println("--------------------------------------------------");
  }

  // 5. WATCHDOG DE COMUNICAÇÃO (15 MINUTOS SEM SUCESSO = REBOOT)
  if (agora - ultimoEnvioSucesso >= TIMEOUT_REINICIO_SEM_COMUNICEACAO) {
    Serial.println("\n🚨 [ALERTA CRÍTICO] Placa sem comunicação há mais de 15 minutos!");
    Serial.println("🔄 Executando reinício preventivo (ESP.restart)...");
    delay(1000);
    ESP.restart(); 
  }
}