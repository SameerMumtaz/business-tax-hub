import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  TrendingUp,
  TrendingDown,
  Receipt,
  FileText,
  DollarSign,
  Upload,
  Tag,
  Building2,
  LogOut,
  Calculator,
  Users,
  UserCircle,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

const links = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/import", label: "Import", icon: Upload },
  { to: "/categorization", label: "Categories", icon: Tag },
  { to: "/sales", label: "Sales", icon: TrendingUp },
  { to: "/invoices", label: "Invoices", icon: FileText },
  { to: "/clients", label: "Clients", icon: UserCircle },
  { to: "/expenses", label: "Expenses", icon: TrendingDown },
  { to: "/profit-loss", label: "Profit & Loss", icon: DollarSign },
  { to: "/tax-center", label: "Tax Center", icon: Calculator },
  { to: "/1099", label: "Employees/Contractors", icon: Users },
  { to: "/profile", label: "Company Profile", icon: Building2 },
];

export default function AppSidebar() {
  const location = useLocation();
  const { user, signOut } = useAuth();

  return (
    <aside className="w-64 min-h-screen bg-sidebar border-r border-sidebar-border flex flex-col">
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <Receipt className="h-6 w-6 text-sidebar-primary" />
          <span className="text-lg font-semibold text-sidebar-accent-foreground tracking-tight">
            TaxDash
          </span>
        </div>
        <p className="text-xs text-sidebar-foreground mt-1">Business Tax Filing</p>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {links.map(({ to, label, icon: Icon }) => {
          const isActive = location.pathname === to;
          return (
            <NavLink
              key={to}
              to={to}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          );
        })}
      </nav>

      <div className="p-4 border-t border-sidebar-border space-y-3">
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
