import { NavLink, useLocation } from "react-router-dom";
import {
  FileText,
  Calendar,
  Clock,
  Users,
  MapPin,
  LogOut,
  Receipt,
  Link2,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import bookieLogo from "@/assets/bookie-logo.png";
import { Button } from "@/components/ui/button";
import LinkToBusinessCard from "@/components/LinkToBusinessCard";

const links = [
  { to: "/invoices", label: "Invoices", icon: FileText },
  { to: "/team", label: "Members", icon: Users },
  { to: "/team?tab=scheduler", label: "Job Scheduler", icon: Calendar },
  { to: "/team?tab=timesheets", label: "Timesheets", icon: Clock },
  { to: "/team?tab=crew-map", label: "Crew Map", icon: MapPin },
];

export default function ManagerSidebar() {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const currentFull = location.pathname + location.search;

  const isActive = (to: string) => {
    if (to.includes("?")) return currentFull === to || currentFull.startsWith(to + "&");
    return location.pathname === to && !location.search;
  };

  return (
    <aside className="w-64 min-h-screen bg-sidebar border-r border-sidebar-border flex flex-col">
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <img src={bookieLogo} alt="Bookie" className="h-7 w-7" />
          <span className="text-lg font-semibold text-sidebar-accent-foreground tracking-tight">
            Bookie
          </span>
        </div>
        <p className="text-xs text-sidebar-foreground mt-1">All-in-One Business Management</p>
      </div>

      <nav className="flex-1 p-3 space-y-0.5">
        {links.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              isActive(item.to)
                ? "bg-sidebar-accent text-sidebar-primary"
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            }`}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-sidebar-border space-y-3">
        <div className="space-y-1">
          <p className="text-xs text-sidebar-foreground font-medium flex items-center gap-1">
            <Link2 className="h-3 w-3" /> Link to Business
          </p>
          <LinkToBusinessCard compact />
        </div>
        {user && (
          <p className="text-xs text-sidebar-foreground truncate">{user.email}</p>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-sidebar-foreground hover:text-sidebar-accent-foreground"
          onClick={signOut}
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sign Out
        </Button>
      </div>
    </aside>
  );
}
