import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Menu, LayoutDashboard, UserPlus, Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function MobileNav() {
  const navigate = useNavigate();

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" className="md:hidden p-2">
          <Menu className="h-6 w-6 text-white" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="bg-zinc-950 border-zinc-800 text-white">
        <div className="flex flex-col gap-6 mt-10">
          <h2 className="text-xl font-bold text-emerald-500">FRIOCTRL</h2>
          <nav className="flex flex-col gap-4">
            <Button variant="ghost" className="justify-start" onClick={() => navigate("/")}>
              <LayoutDashboard className="mr-2 h-4 w-4" /> Painel
            </Button>
            <Button variant="ghost" className="justify-start" onClick={() => navigate("/cameras")}>
              <Settings className="mr-2 h-4 w-4" /> Gerenciar Câmaras
            </Button>
            <Button variant="ghost" className="justify-start" onClick={() => navigate("/admin")}>
              <UserPlus className="mr-2 h-4 w-4" /> Criar Usuários
            </Button>
          </nav>
        </div>
      </SheetContent>
    </Sheet>
  );
}