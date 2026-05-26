import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import Dashboard from "./pages/Dashboard";
import AdminChambers from "./pages/AdminChambers";
import SystemDetail from "./pages/SystemDetail";
import Auth from "./pages/Auth";
import Bancada from "./pages/Bancada";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => {
  useEffect(() => {
    // Declara o OneSignal no escopo do window
    const windowWithOneSignal = window as any;
    windowWithOneSignal.OneSignal = windowWithOneSignal.OneSignal || [];

    windowWithOneSignal.OneSignal.push(() => {
      windowWithOneSignal.OneSignal.init({
        appId: "f72d6a18-1a19-48c9-b886-e023d2c49bcb",
        // Ajuste exato com a barra inicial para a subpasta do Vite buscar o arquivo na raiz do build
        serviceWorkerPath: "/projeto-artico/OneSignalSDKWorker.js",
        serviceWorkerParam: { scope: "/projeto-artico/" },
        allowLocalhostAsSecureOrigin: true,
        notifyButton: {
          enable: true, // Cria o sininho flutuante na tela pra ajudar a forçar o clique
          position: "bottom-left",
        },
      });
    });

    // Função de clique para ativar o prompt do iOS na marra
    const forcarPromptPush = () => {
      if (windowWithOneSignal.OneSignal && windowWithOneSignal.OneSignal.Notifications) {
        console.log("Toque detectado: Solicitando permissão de Push...");
        windowWithOneSignal.OneSignal.Notifications.requestPermission();
      }
    };

    window.addEventListener("click", forcarPromptPush, { once: true });

    return () => {
      window.removeEventListener("click", forcarPromptPush);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Sonner theme="dark" />
        <HashRouter>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/system/:id" element={<SystemDetail />} />
            <Route path="/bancada" element={<Bancada />} />
            <Route path="/admin" element={<AdminChambers />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </HashRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;