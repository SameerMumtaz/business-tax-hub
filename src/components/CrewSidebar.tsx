import { NavLink, useLocation } from "react-router-dom";
import { MapPin, LogOut, Clock, MessageSquare } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Receipt } from "lucide-react";

export default function CrewSidebar() {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { t } = useLanguage();

  const links = [
    { to: "/crew", label: t("nav.myJobs"), icon: MapPin },
    { to: "/crew/history", label: t("nav.checkinHistory"), icon: Clock },
    { to: "/chat", label: "Team Chat", icon: MessageSquare },
  ];

  return (
    <aside className="w-64 h-screen bg-sidebar border-r border-sidebar-border flex flex-col sticky top-0">
      <div className="p-5 border-b border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <Receipt className="h-6 w-6 text-sidebar-primary" />
          <span className="text-lg font-semibold text-sidebar-accent-foreground tracking-tight">
            Bookie
          </span>
        </div>
        <p className="text-xs text-sidebar-foreground mt-1.5 opacity-70">{t("nav.crewPortal")}</p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 flex flex-col justify-center">
        {links.map((item) => {
          const isActive = location.pathname === item.to;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
              }`}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      <div className="p-4 border-t border-sidebar-border space-y-2.5">
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
          {t("nav.signOut")}
        </Button>
      </div>
    </aside>
  );
}
