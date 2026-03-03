import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Wallet,
  TrendingDown,
  Receipt,
  Calculator,
  FileText,
  LogOut,
  UserCircle,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import AccountSwitcher from "@/components/AccountSwitcher";

const links = [
  { to: "/personal", label: "Dashboard", icon: LayoutDashboard },
  { to: "/personal/income", label: "Income", icon: Wallet },
  { to: "/personal/expenses", label: "Expenses", icon: TrendingDown },
  { to: "/personal/deductions", label: "Deductions", icon: Receipt },
  { to: "/personal/tax-center", label: "Tax Center", icon: Calculator },
  { to: "/personal/1040", label: "1040 Preview", icon: FileText },
  { to: "/personal/profile", label: "My Info", icon: UserCircle },
];

export default function PersonalSidebar() {
  const location = useLocation();
  const { user, signOut } = useAuth();

  return (
    <aside className="w-64 min-h-screen bg-sidebar border-r border-sidebar-border flex flex-col">
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <Receipt className="h-6 w-6 text-sidebar-primary" />
          <span className="text-lg font-semibold text-sidebar-accent-foreground tracking-tight">
            Bookie
          </span>
        </div>
        <p className="text-xs text-sidebar-foreground mt-1">Personal Tax Filing</p>
      </div>

      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {links.map((item) => {
          const isActive = location.pathname === item.to;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      <div className="p-4 border-t border-sidebar-border space-y-3">
        <AccountSwitcher current="individual" />
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
        <p className="text-xs text-sidebar-foreground">Tax Year 2026</p>
      </div>
    </aside>
  );
}
