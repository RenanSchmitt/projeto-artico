#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>

// 📶 Wi-Fi
const char* ssid     = "SCHMITT";
const char* password = "Sappy15021996!";

// 🌐 URL do XML ou JSON do BOSS (Substitua pela URL real que encontrar)
const char* boss_api_url = "http://192.168.2.50/api/v1/status.json"; 

// ☁️ Supabase
const char* supabase_url = "https://vpmukocqdtljdxqndwts.supabase.co/rest/v1/telemetry";
const char* supabase_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwbXVrb2NxZHRsamR4cW5kd3RzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3NTM4NDgsImV4cCI6MjA5NTMyOTg0OH0.AEKSUKqtOVgyciUAlmXhN9nHcBtuRt1TykDQII_dtJ0"; 
const char* chamber_id   = "52a92b59-1822-4bcf-aa6c-ccdc698efdf1"; 

unsigned long ultimoEnvio = 0;
const unsigned long intervaloEnvio = 60000; // ⏱️ Exatamente 1 minuto (60000 ms)

void setup() {
  Serial.begin(9600);
  delay(1500);
  Serial.println("\n==================================================");
  Serial.println("       FrioCtrl IoT - MODO WEBSERVICE (1 MIN)     ");
  Serial.println("==================================================");

  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.println("\n🟢 Wi-Fi Conectado!");
}

void loop() {
  if (WiFi.status() == WL_CONNECTED && (millis() - ultimoEnvio >= intervaloEnvio || ultimoEnvio == 0)) {
    ultimoEnvio = millis();

    Serial.println("\n-------------------------------------------");
    Serial.println("📡 Solicitando dados ao BOSS...");

    HTTPClient httpBoss;
    httpBoss.begin(boss_api_url);
    
    // Se a API do BOSS precisar de login básico, descomente a linha abaixo:
    // httpBoss.setAuthorization("usuario", "senha");

    int httpCodeBoss = httpBoss.GET();

    if (httpCodeBoss == HTTP_CODE_OK) {
      String payload = httpBoss.getString();
      Serial.println("🟢 Dados recebidos do BOSS com sucesso!");
      
      // --- REGRA DE EXTRAÇÃO ---
      // Aqui nós vamos ler a string 'payload' (que é o XML ou JSON) 
      // e pescar o valor da temperatura de dentro dela.
      float temperaturaLida = 23.5; // Valor provisório até tratarmos o texto
      // -------------------------

      // Despacha para o Supabase
      HTTPClient httpSupabase;
      httpSupabase.begin(supabase_url);
      httpSupabase.addHeader("Content-Type", "application/json");
      httpSupabase.addHeader("apikey", supabase_key);
      httpSupabase.addHeader("Authorization", ("Bearer " + String(supabase_key)).c_str());

      String jsonSupabase = "{\"chamber_id\": \"" + String(chamber_id) + "\",\"temperature\": " + String(temperaturaLida) + ",\"suction_pressure\": 1.4,\"compressor_on\": true}";
      
      int httpCodeSupa = httpSupabase.POST(jsonSupabase);
      Serial.print("🚀 Status de Envio Supabase: "); Serial.println(httpCodeSupa);
      
      httpSupabase.end();
    } else {
      Serial.print("❌ Erro ao ler o BOSS. Código HTTP: "); Serial.println(httpCodeBoss);
    }
    httpBoss.end();
  }
}