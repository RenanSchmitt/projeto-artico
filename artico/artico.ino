#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <OneWire.h>
#include <DallasTemperature.h>

// =========================================================================
// 1. CONFIGURAÇÕES DO WI-FI
// =========================================================================
const char* ssid     = "SCHMITT";
const char* password = "Sappy15021996!";

// =========================================================================
// 2. CREDENCIAIS DO SUPABASE
// =========================================================================
const char* supabase_url = "https://vpmukocqdtljdxqndwts.supabase.co/rest/v1/telemetry";
const char* supabase_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwbXVrb2NxZHRsamR4cW5kd3RzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3NTM4NDgsImV4cCI6MjA5NTMyOTg0OH0.AEKSUKqtOVgyciUAlmXhN9nHcBtuRt1TykDQII_dtJ0"; 
const char* chamber_id   = "248613ed-9ae0-4592-8519-032b17f95f22"; 

// =========================================================================
// 3. SENSOR DS18B20
// =========================================================================
#define ONE_WIRE_BUS 13

OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);

unsigned long ultimoEnvio = 0;
const unsigned long intervaloEnvio = 10000; // Envia a cada 10 segundos

void setup() {
  Serial.begin(9600); // Sincronizado com 9600 baud
  delay(1500);

  Serial.println("\n--- FrioCtrl IoT: INICIANDO ESP32 ---");

  pinMode(ONE_WIRE_BUS, INPUT_PULLUP);
  delay(50);

  sensors.begin();
  
  WiFi.disconnect(true);
  delay(1000);

  WiFi.begin(ssid, password);
  Serial.println("📡 Conectando ao Wi-Fi...");
}

void loop() {
  if (millis() - ultimoEnvio >= intervaloEnvio) {
    ultimoEnvio = millis();

    // 🌡️ 1. Leitura de Temperatura
    sensors.requestTemperatures(); 
    float temperature = sensors.getTempCByIndex(0);

    if (temperature == DEVICE_DISCONNECTED_C) {
      Serial.println("❌ Alerta: Sensor DS18B20 desconectado!");
      temperature = -15.0; // Valor base de teste
    }

    // 📊 2. Variáveis de Telemetria (Casando perfeitamente com a Tabela SQL)
    float suction_pressure     = 1.4;                  
    float evaporation_pressure = 1.3;                  
    float superheat            = 7.2;                  
    float subcooling           = 4.5;                  
    float condensation_temp    = 36.8;                 
    float eev_opening          = 42.5;                 
    bool compressor_on         = (temperature > -18.0); 

    Serial.println("\n-------------------------------------------");
    Serial.print("🌡️ Temp. Sensor: ");
    Serial.print(temperature, 1);
    Serial.println(" °C");

    // 🌐 3. Envio para o Supabase
    if (WiFi.status() == WL_CONNECTED) {
      HTTPClient http;
      http.begin(supabase_url);
      
      http.addHeader("Content-Type", "application/json");
      http.addHeader("apikey", supabase_key);
      http.addHeader("Authorization", ("Bearer " + String(supabase_key)).c_str());

      // JSON montado com o nome correto da coluna "condensation_temp"
      String jsonDados = "{";
      jsonDados += "\"chamber_id\": \"" + String(chamber_id) + "\",";
      jsonDados += "\"temperature\": " + String(temperature, 1) + ",";
      jsonDados += "\"suction_pressure\": " + String(suction_pressure, 2) + ",";
      jsonDados += "\"evaporation_pressure\": " + String(evaporation_pressure, 2) + ",";
      jsonDados += "\"superheat\": " + String(superheat, 1) + ",";
      jsonDados += "\"subcooling\": " + String(subcooling, 1) + ",";
      jsonDados += "\"condensation_temp\": " + String(condensation_temp, 1) + ",";
      jsonDados += "\"eev_opening\": " + String(eev_opening, 1) + ",";
      jsonDados += "\"compressor_on\": " + String(compressor_on ? "true" : "false");
      jsonDados += "}";

      Serial.println("📤 Disparando telemetria...");
      int codigoResposta = http.POST(jsonDados);

      Serial.print("Código de Resposta do Servidor: ");
      Serial.println(codigoResposta);

      String respostaServidor = http.getString();

      if (codigoResposta == 201 || codigoResposta == 200) {
        Serial.println("✅ Sucesso! Dados gravados na tabela 'telemetry'.");
      } else {
        Serial.println("❌ Erro ao gravar no Supabase:");
        Serial.println(respostaServidor);
      }

      http.end();
    } else {
      Serial.println("⚠️ Wi-Fi desconectado. Reconectando...");
      WiFi.begin(ssid, password);
    }
  }
}