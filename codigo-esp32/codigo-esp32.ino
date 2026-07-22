#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <OneWire.h>
#include <DallasTemperature.h>

// =========================================================================
// 1. CONFIGURAÇÕES DO WI-FI
// =========================================================================
const char* ssid     = "Gesiele_2G"; 
const char* password = "Familiafarias#10"; 

// =========================================================================
// 2. CREDENCIAIS DO SUPABASE
// =========================================================================
const char* supabase_base_url = "https://vpmukocqdtljdxqndwts.supabase.co/rest/v1";
const char* supabase_key      = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwbXVrb2NxZHRsamR4cW5kd3RzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3NTM4NDgsImV4cCI6MjA5NTMyOTg0OH0.AEKSUKqtOVgyciUAlmXhN9nHcBtuRt1TykDQII_dtJ0"; 

// =========================================================================
// 3. ESTRUTURA E CADASTRO DAS ILHAS
// =========================================================================
struct Ilha {
  const char* chamber_id;        // ID da câmara no Supabase
  float setPoint;                // Padrão de backup: -18.0 °C
  float tempMin;                 // Padrão de backup: -22.0 °C
  float tempMax;                 // Padrão de backup: -15.0 °C
  
  unsigned long intervaloDegelo; // Intervalo de 4 horas
  unsigned long duracaoDegelo;   // Duração de 15 minutos
  
  // Variáveis de controle interno
  float tempAtual;
  bool compressor_on;
  bool defrost_on;
  unsigned long inicioUltimoDegelo;
};

// Cadastro das Ilhas
Ilha ilhas[] = {
  { "248613ed-9ae0-4592-8519-032b17f95f22", -18.0, -22.0, -15.0, (4 * 60 * 60 * 1000UL), (15 * 60 * 1000UL), 0.0, false, false, 0 }, // Ilha 1 (Sensor Index 0)
  { "1b56a4c7-8c3d-4aa7-a3de-4fd511aaf536", -18.0, -22.0, -15.0, (4 * 60 * 60 * 1000UL), (15 * 60 * 1000UL), 0.0, false, false, 0 }  // Ilha 2 (Sensor Index 1)
};

const int totalIlhas = sizeof(ilhas) / sizeof(ilhas[0]);

// =========================================================================
// 4. SENSORES DS18B20 E PINOS
// =========================================================================
#define ONE_WIRE_BUS 13

OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);

// Temporizadores independentes
unsigned long ultimoEnvio = 0;
const unsigned long intervaloEnvio = 10000; // Telemetria a cada 10 segundos

unsigned long ultimaBuscaParametros = 0;
const unsigned long intervaloParametros = 5 * 60 * 1000UL; // Busca no Supabase a cada 5 minutos

// =========================================================================
// 5. BUSCA DE PARÂMETROS DO PAINEL (GET)
// =========================================================================
void buscarParametrosSupabase(Ilha &ilha) {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    String url = String(supabase_base_url) + "/chambers?id=eq." + String(ilha.chamber_id) + "&select=setpoint,min_temp,max_temp";
    
    http.begin(url);
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

// =========================================================================
// 6. ENVIO DE TELEMETRIA (POST)
// =========================================================================
void enviarTelemetria(Ilha &ilha, int numero_ilha) {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    String url = String(supabase_base_url) + "/telemetry";
    http.begin(url);
    
    http.addHeader("Content-Type", "application/json");
    http.addHeader("apikey", supabase_key);
    http.addHeader("Authorization", ("Bearer " + String(supabase_key)).c_str());

    float suction_pressure     = 1.4;                  
    float evaporation_pressure = 1.3;                  
    float superheat            = 7.2;                  
    float subcooling           = 4.5;                  
    float condensation_temp    = 36.8;                 
    float eev_opening          = 42.5;                 

    String jsonDados = "{";
    jsonDados += "\"chamber_id\": \"" + String(ilha.chamber_id) + "\",";
    jsonDados += "\"temperature\": " + String(ilha.tempAtual, 1) + ",";
    jsonDados += "\"suction_pressure\": " + String(suction_pressure, 2) + ",";
    jsonDados += "\"evaporation_pressure\": " + String(evaporation_pressure, 2) + ",";
    jsonDados += "\"superheat\": " + String(superheat, 1) + ",";
    jsonDados += "\"subcooling\": " + String(subcooling, 1) + ",";
    jsonDados += "\"condensation_temp\": " + String(condensation_temp, 1) + ",";
    jsonDados += "\"eev_opening\": " + String(eev_opening, 1) + ",";
    jsonDados += "\"compressor_on\": " + String(ilha.compressor_on ? "true" : "false") + ",";
    jsonDados += "\"defrost_on\": " + String(ilha.defrost_on ? "true" : "false");
    jsonDados += "}";

    int codigoResposta = http.POST(jsonDados);

    if (codigoResposta == 201 || codigoResposta == 200) {
      Serial.printf("  └─ 🟢 [Ilha %d] Telemetria OK! Temp: %.1f°C | SP: %.1f°C | Max: %.1f°C | Comp: %s | Degelo: %s\n", 
                    numero_ilha, ilha.tempAtual, ilha.setPoint, ilha.tempMax,
                    ilha.compressor_on ? "ON" : "OFF", 
                    ilha.defrost_on ? "ON" : "OFF");
    } else {
      Serial.printf("  └─ ❌ [Ilha %d] Erro HTTP %d ao enviar telemetria.\n", numero_ilha, codigoResposta);
    }

    http.end();
  }
}

void setup() {
  Serial.begin(9600); 
  delay(1500);

  Serial.println("\n--- FrioCtrl IoT: INICIANDO ESP32 (SISTEMA MULTI-ILHAS) ---");

  pinMode(ONE_WIRE_BUS, INPUT_PULLUP);
  delay(50);

  sensors.begin();
  
  int qtdSensoresFisicos = sensors.getDeviceCount();
  Serial.printf("🔍 Sensores detectados no cabo: %d\n", qtdSensoresFisicos);
  Serial.printf("📋 Ilhas configuradas no código: %d\n", totalIlhas);

  unsigned long agora = millis();
  for (int i = 0; i < totalIlhas; i++) {
    ilhas[i].inicioUltimoDegelo = agora;
  }

  WiFi.disconnect(true);
  delay(1000);

  WiFi.begin(ssid, password);
  Serial.println("📡 Conectando ao Wi-Fi...");
}

void loop() {
  unsigned long agora = millis();

  // -----------------------------------------------------------------------
  // 1. SINCRONIZAÇÃO DE PARÂMETROS DO SUPABASE (Ao ligar e a cada 5 min)
  // -----------------------------------------------------------------------
  if (agora - ultimaBuscaParametros >= intervaloParametros || ultimaBuscaParametros == 0) {
    if (WiFi.status() == WL_CONNECTED) {
      ultimaBuscaParametros = agora; // Atualiza o cronômetro SOMENTE após conectar
      Serial.println("\n🔄 [SYNC] Buscando Setpoints e Limites atualizados no Supabase...");
      for (int i = 0; i < totalIlhas; i++) {
        buscarParametrosSupabase(ilhas[i]);
        delay(50);
      }
    }
  }

  // -----------------------------------------------------------------------
  // 2. LEITURA DOS SENSORES E CONTROLE DE LÓGICA
  // -----------------------------------------------------------------------
  sensors.requestTemperatures(); 

  for (int i = 0; i < totalIlhas; i++) {
    float temp = sensors.getTempCByIndex(i);
    ilhas[i].tempAtual = (temp == DEVICE_DISCONNECTED_C) ? -15.0 : temp;

    // Degelo
    if (!ilhas[i].defrost_on && (agora - ilhas[i].inicioUltimoDegelo >= ilhas[i].intervaloDegelo)) {
      ilhas[i].defrost_on = true;
      ilhas[i].inicioUltimoDegelo = agora;
      Serial.printf("\n🧊 [ILHA %d] Entrou em MODO DEGELO!\n", i + 1);
    } 
    else if (ilhas[i].defrost_on && (agora - ilhas[i].inicioUltimoDegelo >= ilhas[i].duracaoDegelo)) {
      ilhas[i].defrost_on = false;
      ilhas[i].inicioUltimoDegelo = agora;
      Serial.printf("\n🔥 [ILHA %d] Finalizou MODO DEGELO!\n", i + 1);
    }

    // Compressor
    if (ilhas[i].defrost_on) {
      ilhas[i].compressor_on = false; 
    } else {
      if (ilhas[i].tempAtual >= ilhas[i].tempMax) {
        ilhas[i].compressor_on = true;  
      } 
      else if (ilhas[i].tempAtual <= ilhas[i].setPoint || ilhas[i].tempAtual <= ilhas[i].tempMin) {
        ilhas[i].compressor_on = false; 
      }
    }
  }

  // -----------------------------------------------------------------------
  // 3. ENVIO DA TELEMETRIA PARA O SUPABASE (A cada 10 segundos)
  // -----------------------------------------------------------------------
  if (agora - ultimoEnvio >= intervaloEnvio) {
    ultimoEnvio = agora;

    Serial.println("\n--------------------------------------------------");
    if (WiFi.status() == WL_CONNECTED) {
      for (int i = 0; i < totalIlhas; i++) {
        enviarTelemetria(ilhas[i], i + 1);
        delay(100); 
      }
    } else {
      Serial.println("⚠️ Wi-Fi desconectado. Tentando reconectar...");
      WiFi.begin(ssid, password);
    }
    Serial.println("--------------------------------------------------");
  }
}