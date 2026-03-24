import { NavLink, useLocation } from "react-router-dom";
import { useState } from "react";
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
  ChevronDown,
  Clock,
  Scale,
  BarChart3,
  AlertTriangle,
  FileBarChart,
  Percent,
  Home,
  Car,
  ClipboardList,
  CalendarDays,
  Eye,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import AccountSwitcher from "@/components/AccountSwitcher";

interface NavChild {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
}

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  children?: NavChild[];
  matchPaths?: string[];
}

const links: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/import", label: "Import", icon: Upload },
  { to: "/categorization", label: "Auto-Sort Rules", icon: Tag },
  {
    to: "/sales", label: "Money In", icon: TrendingUp,
    matchPaths: ["/sales", "/invoices", "/clients", "/aging", "/quotes"],
    children: [
      { to: "/sales", label: "Overview", icon: TrendingUp },
      { to: "/quotes", label: "Quotes", icon: ClipboardList },
      { to: "/invoices", label: "Invoices", icon: FileText },
      { to: "/clients", label: "Clients", icon: UserCircle },
      { to: "/aging", label: "Unpaid Invoices", icon: Clock },
    ],
  },
  {
    to: "/expenses", label: "Money Out", icon: TrendingDown,
    matchPaths: ["/expenses", "/vehicles"],
    children: [
      { to: "/expenses", label: "Overview", icon: TrendingDown },
      { to: "/expenses?tab=trends", label: "Spending Trends", icon: AlertTriangle },
      { to: "/vehicles", label: "Vehicles", icon: Car },
    ],
  },
  {
    to: "/profit-loss", label: "Reports", icon: BarChart3,
    matchPaths: ["/profit-loss", "/reconciliation"],
    children: [
      { to: "/profit-loss", label: "Income vs Expenses", icon: DollarSign },
      { to: "/profit-loss?tab=compare", label: "Compare Periods", icon: FileBarChart },
      { to: "/reconciliation", label: "Match Transactions", icon: Scale },
    ],
  },
  {
    to: "/tax-center", label: "Taxes", icon: Calculator,
    matchPaths: ["/tax-center"],
    children: [
      { to: "/tax-center", label: "Tax Estimates", icon: Calculator },
      { to: "/tax-center?tab=deductions", label: "Deductions", icon: Percent },
      { to: "/tax-center?tab=schedule-c", label: "Tax Form Preview", icon: Home },
    ],
  },
  {
    to: "/team", label: "Team", icon: Users,
    matchPaths: ["/team"],
    children: [
      { to: "/team", label: "Supervisor", icon: Eye },
      { to: "/team?tab=scheduler", label: "Schedule", icon: BarChart3 },
      { to: "/team?tab=timesheets", label: "Timesheets", icon: Clock },
      { to: "/team?tab=members", label: "Members", icon: Users },
    ],
  },
  { to: "/1099", label: "Team & Contractors", icon: Users },
  { to: "/booking-settings", label: "Online Booking", icon: CalendarDays },
  { to: "/profile", label: "Business Info", icon: Building2 },
];

export default function AppSidebar() {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const currentFull = location.pathname + location.search;

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    links.forEach((item) => {
      if (item.children && item.matchPaths) {
        if (item.matchPaths.some((p) => location.pathname === p || location.pathname.startsWith(p + "/"))) {
          init[item.to] = true;
        }
      }
    });
    return init;
  });

  const toggleGroup = (key: string) =>
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));

  const isChildActive = (child: NavChild) => {
    if (child.to.includes("?")) {
      return currentFull === child.to || currentFull.startsWith(child.to + "&");
    }
    return location.pathname === child.to && !location.search;
  };

  const isGroupActive = (item: NavItem) =>
    item.matchPaths?.some((p) => location.pathname === p) ?? false;

  const renderLink = (to: string, label: string, Icon: typeof LayoutDashboard, active: boolean, indent = false) => (
    <NavLink
      key={to + label}
      to={to}
      className={`flex items-center gap-3 ${indent ? "pl-10 pr-3" : "px-3"} py-2.5 rounded-lg text-sm font-medium transition-colors ${
        active
          ? "bg-sidebar-accent text-sidebar-primary"
          : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </NavLink>
  );

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

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto flex flex-col justify-center">
        {links.map((item) => {
          if (item.children) {
            const groupOpen = openGroups[item.to] ?? false;
            const groupActive = isGroupActive(item);
            return (
              <div key={item.to} className="space-y-0.5">
                <button
                  onClick={() => toggleGroup(item.to)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors w-full ${
                    groupActive
                      ? "bg-sidebar-accent text-sidebar-primary"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                  }`}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {item.label}
                  <ChevronDown className={`h-3.5 w-3.5 ml-auto transition-transform duration-200 ${groupOpen ? "rotate-180" : ""}`} />
                </button>
                {groupOpen && (
                  <div className="mt-0.5 space-y-0.5">
                    {item.children.map((child) =>
                      renderLink(child.to, child.label, child.icon, isChildActive(child), true)
                    )}
                  </div>
                )}
              </div>
            );
          }
          const isActive = location.pathname === item.to;
          return renderLink(item.to, item.label, item.icon, isActive);
        })}
      </nav>

      <div className="p-4 border-t border-sidebar-border space-y-2.5">
        <AccountSwitcher current="business" />
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
        <p className="text-[11px] text-sidebar-foreground opacity-50">Tax Year 2026</p>
      </div>
    </aside>
  );
}
