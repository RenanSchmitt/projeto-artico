#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <ArduinoJson.h>
#include <esp_task_wdt.h>

// =========================================================================
// 📌 1. IDENTIFICAÇÃO DOS EQUIPAMENTOS (FREEZERS)
// =========================================================================
const char* CHAMBER_ID_1 = "ca2023c3-28e6-4299-9c4b-cbcf8f32805d"; 
const char* CHAMBER_ID_2 = "75dc69c1-acdc-47f3-a3b1-0c5cc56c2bf5"; // ID do Balcão 2

// =========================================================================
// 📌 2. CONFIGURAÇÕES DA REDE WI-FI LOCAL
// =========================================================================
const char* ssid     = "Gesiele_2G";  
const char* password = "Familiafarias#10";  

// =========================================================================
// 📌 3. CREDENCIAIS DO SUPABASE
// =========================================================================
const char* supabase_base_url = "https://vpmukocqdtljdxqndwts.supabase.co/rest/v1";
const char* supabase_key      = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwbXVrb2NxZHRsamR4cW5kd3RzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3NTM4NDgsImV4cCI6MjA5NTMyOTg0OH0.AEKSUKqtOVgyciUAlmXhN9nHcBtuRt1TykDQII_dtJ0";

// =========================================================================
// 📌 4. PARAMETRIZAÇÃO TÉCNICA E CALIBRAÇÃO
// =========================================================================
const float OFFSET_FREEZER = -2.0; 

// =========================================================================
// 📌 5. ESTRUTURA DE DADOS DOS FREEZERS (2 Sensores Mapeados)
// =========================================================================
struct Freezer {
  const char* chamber_id;    
  float setPoint;             
  float tempAtual;            
};

Freezer freezers[] = {
  { CHAMBER_ID_1, -18.0, 0.0 }, // Sensor 0 -> Balcão 1
  { CHAMBER_ID_2, -18.0, 0.0 }  // Sensor 1 -> Balcão 2
};

const int totalFreezers = sizeof(freezers) / sizeof(freezers[0]);

// =========================================================================
// 📌 6. PINAGEM E TEMPORIZADORES
// =========================================================================
#define ONE_WIRE_BUS 13         
#define WDT_TIMEOUT_SECONDS 30  

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
const unsigned long TIMEOUT_REINICIO_SEM_COMUNICEACAO = 15 * 60 * 1000UL; // 15 MINUTOS

// Declaração antecipada
void buscarParametrosSupabase(Freezer &freezer);

// =========================================================================
// 🔄 CONEXÃO WI-FI SEGURA E NÃO-BLOQUEANTE
// =========================================================================
void checarEConectarWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  if (ESP.getFreeHeap() < 40000) {
    Serial.println("\n🚨 [ALERTA DE RAM] Memória baixa (<40KB)! Reiniciando...");
    delay(500);
    ESP.restart();
  }

  Serial.println("\n⚠️ Wi-Fi desconectado! Tentando reconectar...");
  
  WiFi.disconnect(true); 
  delay(100);
  
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  int tentativas = 0;
  while (WiFi.status() != WL_CONNECTED && tentativas < 10) {
    esp_task_wdt_reset(); 
    delay(1000);
    Serial.print(".");
    tentativas++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n🟢 Wi-Fi Conectado!");
    Serial.print("📍 IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\n❌ Falha temporária na reconexão do Wi-Fi.");
  }
}

// =========================================================================
// 🔄 BUSCA PARÂMETROS NO SUPABASE
// =========================================================================
void buscarParametrosSupabase(Freezer &freezer) {
  if (WiFi.status() != WL_CONNECTED) return;
  if (ESP.getFreeHeap() < 50000) return;

  WiFiClientSecure client;
  client.setInsecure(); 

  HTTPClient http;
  String url = String(supabase_base_url) + "/chambers?id=eq." + String(freezer.chamber_id) + "&select=setpoint";
  
  http.setTimeout(4000); 
  
  if (http.begin(client, url)) {
    http.addHeader("apikey", supabase_key);
    http.addHeader("Authorization", ("Bearer " + String(supabase_key)).c_str());

    int httpCode = http.GET();
    if (httpCode == 200) {
      JsonDocument doc;
      if (!deserializeJson(doc, http.getString()) && doc.is<JsonArray>() && doc.size() > 0) {
        JsonObject obj = doc[0];
        if (!obj["setpoint"].isNull()) freezer.setPoint = obj["setpoint"].as<float>();
      }
    }
    http.end();
  }
  client.stop(); 
}

// =========================================================================
// 📤 ENVIO DE TELEMETRIA
// =========================================================================
bool enviarTelemetria(Freezer &freezer, int numero_sensor) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("  └─ ⚠️ Envio cancelado: Sem conexão Wi-Fi.");
    return false;
  }

  if (ESP.getFreeHeap() < 30000) {
    Serial.println("  └─ ⚠️ Memória RAM crítica (<30KB) para SSL.");
    return false;
  }

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  String url = String(supabase_base_url) + "/telemetry";

  JsonDocument doc;
  doc["chamber_id"]           = freezer.chamber_id;
  doc["temperature"]          = freezer.tempAtual; 
  doc["condensation_temp"]    = -15.0; 
  doc["suction_pressure"]     = 1.40;
  doc["evaporation_pressure"] = 1.30;
  doc["superheat"]            = 7.20;
  doc["subcooling"]           = 4.50;
  doc["eev_opening"]          = 42.50;
  doc["compressor_on"]        = true;
  doc["defrost_on"]           = false; 

  String jsonDados;
  serializeJson(doc, jsonDados);

  http.setTimeout(5000); 
  bool sucesso = false;

  if (http.begin(client, url)) {
    http.addHeader("Content-Type", "application/json");
    http.addHeader("apikey", supabase_key);
    http.addHeader("Authorization", ("Bearer " + String(supabase_key)).c_str());

    int codigoResposta = http.POST(jsonDados);
    Serial.printf("  └─ 🌐 Código HTTP Supabase (Sensor %d): %d | Temp: %.1f°C\n", numero_sensor, codigoResposta, freezer.tempAtual);

    if (codigoResposta == 201 || codigoResposta == 200) {
      Serial.printf("  └─ 🟢 [Sensor %d] Envio OK! | Temp: %.1f°C | Defrost: OFF\n", numero_sensor, freezer.tempAtual);
      sucesso = true;
    } else {
      String respostaErro = http.getString();
      Serial.printf("  └─ ❌ Erro Supabase: %s\n", respostaErro.c_str());
    }
    http.end();
  } else {
    Serial.println("  └─ ❌ Falha ao iniciar conexão HTTP.");
  }
  
  client.stop(); 
  return sucesso;
}

// =========================================================================
// 🔍 LEITURA PURA DOS SENSORES
// =========================================================================
void lerSensoresFreezers() {
  sensors.requestTemperatures(); 
  int quantidadeSensores = sensors.getDeviceCount();

  Serial.println("\n--------------------------------------------------");
  Serial.printf("🔍 [SENSORES 1-WIRE] Total encontrados: %d\n", quantidadeSensores);

  if (quantidadeSensores == 0) {
    Serial.println("❌ Nenhum sensor encontrado! Verifique as conexões do pino 13.");
    return;
  }

  for (int i = 0; i < totalFreezers && i < quantidadeSensores; i++) {
    float tempBruta = sensors.getTempCByIndex(i);
    
    if (tempBruta != DEVICE_DISCONNECTED_C && tempBruta != 85.0) {
      freezers[i].tempAtual = tempBruta + OFFSET_FREEZER;
      Serial.printf("  └─ 🧊 Sensor %d: %.2f °C (Corrigido: %.2f °C)\n", i, tempBruta, freezers[i].tempAtual);
    } else {
      Serial.printf("  └─ 🧊 Sensor %d: ⚠️ ERRO DE LEITURA\n", i);
    }
  }
  Serial.println("--------------------------------------------------");
}

// =========================================================================
// 🚀 SETUP
// =========================================================================
void setup() {
  Serial.begin(115200); 
  delay(1000);

  Serial.println("\n--- FrioCtrl IoT (Multi-Freezers): INICIALIZANDO ---");

  esp_task_wdt_deinit();
  esp_task_wdt_config_t twdt_config = {
    .timeout_ms = WDT_TIMEOUT_SECONDS * 1000,
    .idle_core_mask = (1 << portNUM_PROCESSORS) - 1,
    .trigger_panic = true
  };
  esp_task_wdt_init(&twdt_config);
  esp_task_wdt_add(NULL); 

  pinMode(ONE_WIRE_BUS, INPUT_PULLUP);
  delay(50);

  sensors.begin();
  sensors.setResolution(10); 
  sensors.setWaitForConversion(true); 

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  int tentativas = 0;
  while (WiFi.status() != WL_CONNECTED && tentativas < 20) {
    esp_task_wdt_reset();
    delay(500);
    Serial.print(".");
    tentativas++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n🟢 Wi-Fi Conectado!");
    Serial.print("📍 IP: ");
    Serial.println(WiFi.localIP());
    
    for (int i = 0; i < totalFreezers; i++) {
      buscarParametrosSupabase(freezers[i]);
    }
  }

  unsigned long agora = millis();
  ultimoEnvio = agora;
  ultimaBuscaParametros = agora;
  ultimaLeituraSensores = agora;
  ultimaChecagemWiFi = agora;
  ultimoEnvioSucesso = agora; 
}

// =========================================================================
// 🔄 LOOP PRINCIPAL
// =========================================================================
void loop() {
  if (ESP.getFreeHeap() < 40000) {
    Serial.println("\n🚨 [ALERTA] RAM crítica! Reiniciando...");
    delay(500);
    ESP.restart();
  }

  esp_task_wdt_reset();

  unsigned long agora = millis();

  // 1. CHECAGEM PREVENTIVA DO WI-FI
  if (agora - ultimaChecagemWiFi >= intervaloChecagemWiFi) {
    ultimaChecagemWiFi = agora;
    checarEConectarWiFi();
  }

  esp_task_wdt_reset(); 

  // 2. BUSCA DE PARÂMETROS
  if (agora - ultimaBuscaParametros >= intervaloParametros) {
    if (WiFi.status() == WL_CONNECTED) {
      ultimaBuscaParametros = agora;
      for (int i = 0; i < totalFreezers; i++) {
        buscarParametrosSupabase(freezers[i]);
      }
    }
  }

  // 3. LEITURA DOS SENSORES (A CADA 15 SEGUNDOS)
  if (agora - ultimaLeituraSensores >= intervaloSensores) {
    ultimaLeituraSensores = agora;
    lerSensoresFreezers();
  }

  // 4. ENVIO DE TELEMETRIA (A CADA 1 MINUTO)
  if (agora - ultimoEnvio >= intervaloEnvio) {
    ultimoEnvio = agora;
    bool peloMenosUmEnviado = false;

    if (WiFi.status() == WL_CONNECTED) {
      for (int i = 0; i < totalFreezers; i++) {
        if (enviarTelemetria(freezers[i], i + 1)) {
          peloMenosUmEnviado = true;
        }
      }
    }

    if (peloMenosUmEnviado) {
      ultimoEnvioSucesso = agora;
    }
  }

  // 5. WATCHDOG DE COMUNICAÇÃO (15 MINUTOS)
  if (agora - ultimoEnvioSucesso >= TIMEOUT_REINICIO_SEM_COMUNICEACAO) {
    Serial.println("\n🚨 [ALERTA] Sem comunicação há 15 min. Reiniciando...");
    delay(1000);
    ESP.restart(); 
  }
  
  delay(20);
}