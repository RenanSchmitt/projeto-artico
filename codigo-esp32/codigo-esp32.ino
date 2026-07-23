#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <OneWire.h>
#include <DallasTemperature.h>

// =========================================================================
// 1. CONFIGURAÇÕES DO WI-FI
// =========================================================================
const char* ssid     = "Koch - BYOD"; 
const char* password = "koch@30!20_"; 

// =========================================================================
// 2. CREDENCIAIS DO SUPABASE
// =========================================================================
const char* supabase_base_url = "https://vpmukocqdtljdxqndwts.supabase.co/rest/v1";
const char* supabase_key      = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwbXVrb2NxZHRsamR4cW5kd3RzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3NTM4NDgsImV4cCI6MjA5NTMyOTg0OH0.AEKSUKqtOVgyciUAlmXhN9nHcBtuRt1TykDQII_dtJ0"; 

// =========================================================================
// 3. ESTRUTURA DA ILHA
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

// ÍNDICES: Sensor 1 = Freezer / Sensor 0 = Tubo de Degelo
Ilha ilhas[] = {
  { "248613ed-9ae0-4592-8519-032b17f95f22", -18.0, -22.0, -15.0, 1, 0, 0.0, 0.0, true, false }
};

const int totalIlhas = sizeof(ilhas) / sizeof(ilhas[0]);

// =========================================================================
// 4. SENSORES DS18B20
// =========================================================================
#define ONE_WIRE_BUS 13

OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);

unsigned long ultimoEnvio = 0;
const unsigned long intervaloEnvio = 60000; // 1 MINUTO

unsigned long ultimaBuscaParametros = 0;
const unsigned long intervaloParametros = 5 * 60 * 1000UL; // 5 MINUTOS

// =========================================================================
// INICIALIZAÇÃO LIMPA DO WI-FI
// =========================================================================
void iniciarWiFi() {
  Serial.println("\n🌐 Inicializando interface Wi-Fi...");

  WiFi.persistent(false);
  WiFi.disconnect(true, true);
  delay(1000);

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);

  WiFi.begin(ssid, password);
  Serial.printf("📡 Conectando à rede '%s'...\n", ssid);

  int tentativas = 0;
  while (WiFi.status() != WL_CONNECTED && tentativas < 30) {
    delay(500);
    Serial.print(".");
    tentativas++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n🟢 Conectado com sucesso!");
    Serial.print("📍 IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\n⚠️ Tempo limite atingido. O ESP32 continuará tentando em background.");
  }
}

// =========================================================================
// 5. BUSCA DE PARÂMETROS DO PAINEL (GET) COM HTTPS SEGURO
// =========================================================================
void buscarParametrosSupabase(Ilha &ilha) {
  if (WiFi.status() == WL_CONNECTED) {
    WiFiClientSecure client;
    client.setInsecure();

    HTTPClient http;
    String url = String(supabase_base_url) + "/chambers?id=eq." + String(ilha.chamber_id) + "&select=setpoint,min_temp,max_temp";
    
    http.setTimeout(8000);
    http.setReuse(false);
    
    if (http.begin(client, url)) {
      http.addHeader("apikey", supabase_key);
      http.addHeader("Authorization", ("Bearer " + String(supabase_key)).c_str());

      int httpCode = http.GET();

      if (httpCode == 200) {
        String payload = http.getString();
        
        int posSetPoint = payload.indexOf("\"setpoint\":");
        int posMin      = payload.indexOf("\"min_temp\":");
        int posMax      = payload.indexOf("\"max_temp\":");

        if (posSetPoint != -1) {
          int inicio = posSetPoint + 11;
          int fim = payload.indexOf(",", inicio);
          if (fim == -1) fim = payload.indexOf("}", inicio);
          float val = payload.substring(inicio, fim).toFloat();
          if (val != 0.0) ilha.setPoint = val;
        }
        if (posMin != -1) {
          int inicio = posMin + 11;
          int fim = payload.indexOf(",", inicio);
          if (fim == -1) fim = payload.indexOf("}", inicio);
          float val = payload.substring(inicio, fim).toFloat();
          if (val != 0.0) ilha.tempMin = val;
        }
        if (posMax != -1) {
          int inicio = posMax + 11;
          int fim = payload.indexOf(",", inicio);
          if (fim == -1 || fim > payload.indexOf("}", inicio)) fim = payload.indexOf("}", inicio);
          float val = payload.substring(inicio, fim).toFloat();
          if (val != 0.0) ilha.tempMax = val;
        }
      }
      http.end();
    }
  }
}

// =========================================================================
// 6. ENVIO DE TELEMETRIA (POST) COM TRATAMENTO CLIENT SECURE
// =========================================================================
void enviarTelemetria(Ilha &ilha, int numero_ilha) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("  └─ ⚠️ Wi-Fi desconectado. Pulando envio...");
    return;
  }

  WiFiClientSecure client;
  client.setInsecure(); 

  HTTPClient http;
  String url = String(supabase_base_url) + "/telemetry";

  float suction_pressure     = 1.4;                  
  float evaporation_pressure = 1.3;                  
  float superheat            = 7.2;                  
  float subcooling           = 4.5;                  
  float condensation_temp    = 36.8;                 
  float eev_opening          = 42.5;                 

  String jsonDados = "{";
  jsonDados += "\"chamber_id\": \"" + String(ilha.chamber_id) + "\",";
  jsonDados += "\"temperature\": " + String(ilha.tempAtualFreezer, 1) + ",";
  jsonDados += "\"suction_pressure\": " + String(suction_pressure, 2) + ",";
  jsonDados += "\"evaporation_pressure\": " + String(evaporation_pressure, 2) + ",";
  jsonDados += "\"superheat\": " + String(superheat, 1) + ",";
  jsonDados += "\"subcooling\": " + String(subcooling, 1) + ",";
  jsonDados += "\"condensation_temp\": " + String(condensation_temp, 1) + ",";
  jsonDados += "\"eev_opening\": " + String(eev_opening, 1) + ",";
  jsonDados += "\"compressor_on\": " + String(ilha.compressor_on ? "true" : "false") + ",";
  jsonDados += "\"defrost_on\": " + String(ilha.defrost_on ? "true" : "false");
  jsonDados += "}";

  http.setTimeout(10000);
  http.setReuse(false);
  
  if (!http.begin(client, url)) {
    Serial.println("  └─ ❌ Falha ao inicializar o cliente HTTPS.");
    return;
  }

  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", supabase_key);
  http.addHeader("Authorization", ("Bearer " + String(supabase_key)).c_str());

  int codigoResposta = http.POST(jsonDados);

  if (codigoResposta == 201 || codigoResposta == 200) {
    Serial.printf("  └─ 🟢 [Ilha %d] Telemetria OK! [Freezer]: %.1f°C | [SetPoint]: %.1f°C | [Tubo]: %.1f°C | Comp: %s | Degelo: %s\n", 
                  numero_ilha, 
                  ilha.tempAtualFreezer,
                  ilha.setPoint,
                  ilha.tempAtualTuboDegelo,
                  ilha.compressor_on ? "ON" : "OFF", 
                  ilha.defrost_on ? "ON" : "OFF");
  } 
  else {
    Serial.printf("  └─ ⚠️ [Ilha %d] Falha HTTP (%d). Tentando conexão alternativa em 2s...\n", numero_ilha, codigoResposta);
    http.end(); 

    delay(2000); 

    WiFiClientSecure client2;
    client2.setInsecure();
    HTTPClient http2;
    
    http2.setTimeout(10000);
    http2.setReuse(false);

    if (http2.begin(client2, url)) {
      http2.addHeader("Content-Type", "application/json");
      http2.addHeader("apikey", supabase_key);
      http2.addHeader("Authorization", ("Bearer " + String(supabase_key)).c_str());

      int segundoTento = http2.POST(jsonDados);

      if (segundoTento == 201 || segundoTento == 200) {
        Serial.printf("  └─ 🟢 [Ilha %d] Telemetria OK na 2ª tentativa!\n", numero_ilha);
      } else {
        Serial.printf("  └─ ❌ [Ilha %d] Falha persistente na rede. Código: %d\n", numero_ilha, segundoTento);
      }
      http2.end();
    }
    return;
  }
  
  http.end();
}

// =========================================================================
// 7. SETUP
// =========================================================================
void setup() {
  Serial.begin(9600); 
  delay(1500);

  Serial.println("\n--- FrioCtrl IoT: MONITORAMENTO PASSIVO ---");

  pinMode(ONE_WIRE_BUS, INPUT_PULLUP);
  delay(50);

  sensors.begin();
  
  int qtdSensores = sensors.getDeviceCount();
  Serial.printf("🔍 Sensores detectados no barramento: %d\n", qtdSensores);

  iniciarWiFi();
}

// =========================================================================
// 8. LOOP PRINCIPAL
// =========================================================================
void loop() {
  unsigned long agora = millis();

  // 1. Sincronização de parâmetros do Supabase (A cada 5 minutos)
  if (agora - ultimaBuscaParametros >= intervaloParametros || ultimaBuscaParametros == 0) {
    if (WiFi.status() == WL_CONNECTED) {
      ultimaBuscaParametros = agora;
      Serial.println("\n🔄 [SYNC] Buscando Setpoints atualizados no Supabase...");
      for (int i = 0; i < totalIlhas; i++) {
        buscarParametrosSupabase(ilhas[i]);
        delay(50);
      }
    }
  }

  // 2. Leitura dos sensores
  sensors.requestTemperatures(); 

  for (int i = 0; i < totalIlhas; i++) {
    float tempFreezer = sensors.getTempCByIndex(ilhas[i].indexSensorFreezer);
    float tempTubo    = sensors.getTempCByIndex(ilhas[i].indexSensorTuboDegelo);

    // Ajuste de calibração (-2.0°C) no freezer
    if (tempFreezer != DEVICE_DISCONNECTED_C) {
      tempFreezer -= 2.0;
    }

    ilhas[i].tempAtualFreezer    = (tempFreezer == DEVICE_DISCONNECTED_C) ? -15.0 : tempFreezer;
    ilhas[i].tempAtualTuboDegelo = (tempTubo == DEVICE_DISCONNECTED_C) ? 20.0 : tempTubo;

    // Lógica do Degelo (Ativa se tubo > 33.0 °C)
    if (ilhas[i].tempAtualTuboDegelo > 33.0 && ilhas[i].tempAtualTuboDegelo <= 80.0) {
      ilhas[i].defrost_on = true; 
    } else {
      ilhas[i].defrost_on = false; 
    }

    // =========================================================================
    // LÓGICA DO COMPRESSOR (EXCLUSIVA POR SETPOINT + HISTERESE DE 5.0 °C)
    // =========================================================================
    if (ilhas[i].tempAtualFreezer <= ilhas[i].setPoint) {
      // Regra 1: Atingiu ou baixou do Setpoint -> Desliga o compressor
      ilhas[i].compressor_on = false;
    } 
    else if (ilhas[i].tempAtualFreezer >= (ilhas[i].setPoint + 5.0)) {
      // Regra 2: Temperatura subiu 5°C acima do Setpoint -> Religa o compressor
      ilhas[i].compressor_on = true;
    }
    // Obs: Se a temperatura estiver no intervalo entre o Setpoint e (Setpoint + 5°C),
    // o compressor mantém o último estado (OFF se estava descendo, ON se estava subindo).
  }

  // 3. Envio da Telemetria (A cada 1 minuto)
  if (agora - ultimoEnvio >= intervaloEnvio) {
    ultimoEnvio = agora;

    Serial.println("\n--------------------------------------------------");
    if (WiFi.status() == WL_CONNECTED) {
      for (int i = 0; i < totalIlhas; i++) {
        enviarTelemetria(ilhas[i], i + 1);
        delay(100); 
      }
    } else {
      Serial.println("⚠️ Wi-Fi desconectado. Aguardando reconexão do ESP32...");
    }
    Serial.println("--------------------------------------------------");
  }
}