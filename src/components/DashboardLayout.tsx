import { ReactNode, createContext, useContext, useState } from "react";
import AppSidebar from "./AppSidebar";
import ManagerSidebar from "./ManagerSidebar";
import CrewSidebar from "./CrewSidebar";
import { useProfileGate } from "./ProtectedRoute";
import { PanelLeftClose, PanelLeft, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";

type SidebarContextType = { collapsed: boolean; toggle: () => void };
const SidebarContext = createContext<SidebarContextType>({ collapsed: false, toggle: () => {} });
export const useSidebarState = () => useContext(SidebarContext);

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { teamRole } = useProfileGate();
  const isMobile = useIsMobile();

  const SidebarComponent =
    teamRole === "crew" ? CrewSidebar : teamRole === "manager" ? ManagerSidebar : AppSidebar;

  if (isMobile) {
    return (
      <SidebarContext.Provider value={{ collapsed: false, toggle: () => setMobileOpen((o) => !o) }}>
        <div className="flex min-h-screen flex-col">
          <div className="sticky top-0 z-30 flex items-center h-12 px-3 bg-background/80 backdrop-blur border-b gap-3">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-64">
                <SidebarComponent />
              </SheetContent>
            </Sheet>
            <span className="text-sm font-semibold tracking-tight">Bookie</span>
          </div>
          <main className="flex-1 overflow-auto">
            <div className="p-4 max-w-6xl mx-auto">{children}</div>
          </main>
        </div>
      </SidebarContext.Provider>
    );
  }

  return (
    <SidebarContext.Provider value={{ collapsed, toggle: () => setCollapsed((c) => !c) }}>
      <div className="flex min-h-screen">
        <div
          className={`transition-all duration-300 ease-in-out shrink-0 ${
            collapsed ? "w-0 overflow-hidden" : "w-64"
          }`}
        >
          <SidebarComponent />
        </div>
        <main className="flex-1 overflow-auto">
          <div className="sticky top-0 z-10 flex items-center h-10 px-2 bg-background/80 backdrop-blur border-b">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </Button>
          </div>
          <div className="p-4 md:p-8 max-w-6xl mx-auto">{children}</div>
        </main>
      </div>
    </SidebarContext.Provider>
  );
}
