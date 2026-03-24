import { NavLink, useLocation } from "react-router-dom";
import {
  FileText,
  Calendar,
  Clock,
  Users,
  Eye,
  LogOut,
  Receipt,
  Link2,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import LinkToBusinessCard from "@/components/LinkToBusinessCard";

const links = [
  { to: "/invoices", label: "Invoices", icon: FileText },
  { to: "/team", label: "Supervisor", icon: Eye },
  { to: "/team?tab=scheduler", label: "Schedule", icon: Calendar },
  { to: "/team?tab=timesheets", label: "Timesheets", icon: Clock },
  { to: "/team?tab=members", label: "Members", icon: Users },
  
];

export default function ManagerSidebar() {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const currentFull = location.pathname + location.search;

  const isActive = (to: string) => {
    if (to.includes("?")) return currentFull === to || currentFull.startsWith(to + "&");
    if (to === "/team") return location.pathname === "/team" && !location.search;
    return location.pathname === to && !location.search;
  };

  return (
    <aside className="w-64 h-screen bg-sidebar border-r border-sidebar-border flex flex-col sticky top-0">
      <div className="p-5 border-b border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <Receipt className="h-6 w-6 text-sidebar-primary" />
          <span className="text-lg font-semibold text-sidebar-accent-foreground tracking-tight">
            Bookie
          </span>
        </div>
        <p className="text-xs text-sidebar-foreground mt-1.5 opacity-70">All-in-One Business Management</p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 flex flex-col justify-center">
        {links.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isActive(item.to)
                ? "bg-sidebar-accent text-sidebar-primary"
                : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
            }`}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-sidebar-border space-y-2.5">
        <div className="space-y-1">
          <p className="text-xs text-sidebar-foreground font-medium flex items-center gap-1">
            <Link2 className="h-3 w-3" /> Link to Business
          </p>
          <LinkToBusinessCard compact />
        </div>
        {user && (
          <p className="text-xs text-sidebar-foreground truncate opacity-70">{user.email}</p>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-sidebar-foreground hover:text-sidebar-accent-foreground hover:bg-sidebar-accent/60 rounded-lg"
          onClick={signOut}
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sign Out
        </Button>
      </div>
    </aside>
  );
}
