import { ReactNode, createContext, useContext, useState } from "react";
import AppSidebar from "./AppSidebar";
import ManagerSidebar from "./ManagerSidebar";
import CrewSidebar from "./CrewSidebar";
import { useProfileGate } from "./ProtectedRoute";
import { PanelLeftClose, PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

type SidebarContextType = { collapsed: boolean; toggle: () => void };
const SidebarContext = createContext<SidebarContextType>({ collapsed: false, toggle: () => {} });
export const useSidebarState = () => useContext(SidebarContext);

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const { teamRole } = useProfileGate();

  const SidebarComponent =
    teamRole === "crew" ? CrewSidebar : teamRole === "manager" ? ManagerSidebar : AppSidebar;

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
          <div className="p-8 max-w-6xl">{children}</div>
        </main>
      </div>
    </SidebarContext.Provider>
  );
}
