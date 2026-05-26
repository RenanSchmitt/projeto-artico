import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import Dashboard from "./pages/Dashboard";
import AdminChambers from "./pages/AdminChambers"; // 👈 1. IMPORTAR A NOVA PÁGINA

import SystemDetail from "./pages/SystemDetail";
import Auth from "./pages/Auth";
import Bancada from "./pages/Bancada"; // 👈 1. IMPORTAR A NOVA PÁGINA
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner theme="dark" />
      <HashRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/system/:id" element={<SystemDetail />} />
          <Route path="/bancada" element={<Bancada />} /> {/* 👈 2. ADICIONAR A ROTA */}
          <Route path="/admin" element={<AdminChambers />} /> {/* 👈 2. ADICIONAR A ROTA */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </HashRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;