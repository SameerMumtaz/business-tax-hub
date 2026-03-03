import { ReactNode, useState } from "react";
import PersonalSidebar from "./PersonalSidebar";
import { PanelLeftClose, PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PersonalDashboardLayout({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex min-h-screen">
      <div
        className={`transition-all duration-300 ease-in-out shrink-0 ${
          collapsed ? "w-0 overflow-hidden" : "w-64"
        }`}
      >
        <PersonalSidebar />
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
  );
}
