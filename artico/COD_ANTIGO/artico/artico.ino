#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <OneWire.h>
#include <DallasTemperature.h>

// =========================================================================
// 1. CONFIGURAÇÕES DO SEU WI-FI (2.4GHz Confirmado!)
// =========================================================================
const char* ssid     = "SCHMITT";
const char* password = "Sappy15021996!";

// =========================================================================
// 2. CREDENCIAIS REAIS DO SEU SUPABASE (APONTANDO PARA TELEMETRY)
// =========================================================================
const char* supabase_url = "https://vpmukocqdtljdxqndwts.supabase.co/rest/v1/telemetry";
const char* supabase_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwbXVrb2NxZHRsamR4cW5kd3RzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3NTM4NDgsImV4cCI6MjA5NTMyOTg0OH0.AEKSUKqtOVgyciUAlmXhN9nHcBtuRt1TykDQII_dtJ0"; 

// 🎯 ID DA SUA NOVA CÂMARA DE BANCADA JÁ PREENCHIDO!
const char* chamber_id   = "52a92b59-1822-4bcf-aa6c-ccdc698efdf1"; 

// =========================================================================
// 3. CONFIGURAÇÃO DOS PINOS DO SENSOR
// FÍSICO COM INVERSÃO CORRIGIDA:
// No borne verde: Preto/Verde em cima (DAT), Vermelho no meio (VCC), Amarelo embaixo (GND)
// Na ESP32: Branco no D13 (DAT), Cinza no 3V3, Preto no GND
// =========================================================================
#define ONE_WIRE_BUS 13       // Pino D13 recebe os dados (Fio Branco)

OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);

// Controle de tempo (Envia dados a cada 5 segundos)
unsigned long ultimoEnvio = 0;
const unsigned long intervaloEnvio = 60000; 

void setup() {
  // Velocidade de 9600 baud sincronizada com o seu Monitor Serial
  Serial.begin(9600); 
  delay(1500);

  Serial.println("\n--- FrioCtrl IoT: INICIANDO ESP32 ---");
  Serial.println("⚡ Energia ligada direto no pino 3V3 físico (Fio Cinza)");

  // 💡 FORÇA O RESISTOR DE PULL-UP INTERNO DA ESP32 NO PINO 13
  pinMode(ONE_WIRE_BUS, INPUT_PULLUP);
  delay(50);

  // Inicializa o barramento do sensor de temperatura
  sensors.begin();
  
  // Desconecta de qualquer rede anterior para limpar o cache da ESP32
  WiFi.disconnect(true);
  delay(1000);

  // Inicia a tentativa de conexão ao Wi-Fi 2.4GHz
  WiFi.begin(ssid, password);
  Serial.println("📡 Buscando rede Wi-Fi 'SCHMITT'...");
}

void loop() {
  if (millis() - ultimoEnvio >= intervaloEnvio) {
    ultimoEnvio = millis();

    // 🌡️ Passo 1: Solicita e lê a temperatura real do sensor independente do Wi-Fi
    sensors.requestTemperatures(); 
    float temperature = sensors.getTempCByIndex(0);

    Serial.println("\n-------------------------------------------");
    
    // Tratamento caso o sensor seja desconectado fisicamente por mau contato
    if (temperature == DEVICE_DISCONNECTED_C) {
      Serial.println("❌ Erro: Sensor DS18B20 não encontrado! Verifique a fiação.");
    } else {
      Serial.print("🌡️ Temperatura lida no Sensor: ");
      Serial.print(temperature, 1);
      Serial.println(" °C");
    }

    // Parâmetros operacionais adicionais
    float suction_pressure = 1.4;    
    bool compressor_on = (temperature > -18.0); // Liga se estiver acima de -18°C    

    // 🌐 Passo 2: Verifica a conexão e tenta enviar os dados para o Supabase
    if (WiFi.status() == WL_CONNECTED) {
      Serial.println("📶 Wi-Fi Status: Conectado!");
      Serial.print("IP da ESP32: ");
      Serial.println(WiFi.localIP());

      if (temperature == DEVICE_DISCONNECTED_C) {
        Serial.println("⚠️ Envio cancelado: Sensor desconectado.");
        return;
      }

      HTTPClient http;

      // Inicia a requisição apontando para a tabela telemetry
      http.begin(supabase_url);
      
      // Headers obrigatórios de autenticação do Supabase
      http.addHeader("Content-Type", "application/json");
      http.addHeader("apikey", supabase_key);
      http.addHeader("Authorization", ("Bearer " + String(supabase_key)).c_str());

      // Monta o JSON exato aceito pelas colunas da tabela 'telemetry'
      String jsonDados = "{"
                         "\"chamber_id\": \"" + String(chamber_id) + "\","
                         "\"temperature\": " + String(temperature, 1) + ","
                         "\"suction_pressure\": " + String(suction_pressure, 1) + ","
                         "\"compressor_on\": " + String(compressor_on ? "true" : "false") + ""
                         "}";

      Serial.println("Disparando telemetria real para o banco...");
      Serial.print("Payload JSON: ");
      Serial.println(jsonDados);

      // Faz o disparo via HTTP POST
      int codigoResposta = http.POST(jsonDados);

      Serial.print("Código de Resposta do Servidor: ");
      Serial.println(codigoResposta);

      // Código 201 significa criado com sucesso no Supabase!
      if (codigoResposta == 201 || codigoResposta == 200) {
        Serial.println("✅ Sucesso! Os dados reais entraram direto na tabela 'telemetry'.");
      } else {
        Serial.print("❌ Erro no envio. Resposta do banco: ");
        String respostaErro = http.getString();
        Serial.println(respostaErro);
      }

      http.end();
    } else {
      Serial.println("⏳ Wi-Fi Status: Aguardando sinal ou autenticação da rede...");
      // Força a tentativa em segundo plano sem travar o loop físico do sensor
      WiFi.begin(ssid, password);
    }
  }
}