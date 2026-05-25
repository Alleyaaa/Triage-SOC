import { Link, useLocation } from "wouter";
import { Shield, LayoutDashboard, List, FileText, Settings as SettingsIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Sessions", href: "/sessions", icon: List },
  { name: "Reports", href: "/reports", icon: FileText },
  { name: "Settings", href: "/settings", icon: SettingsIcon },
];

export function Sidebar() {
  const [location] = useLocation();

  return (
    <div className="flex h-full w-64 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 shrink-0 items-center px-6 border-b border-sidebar-border">
        <Shield className="h-6 w-6 text-primary mr-3" />
        <span className="font-mono font-bold tracking-tight text-lg uppercase">SOC Triage</span>
      </div>
      <div className="flex-1 flex flex-col gap-1 px-3 py-4">
        {navigation.map((item) => {
          const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
          return (
            <Link key={item.name} href={item.href}>
              <div
                className={cn(
                  "group flex items-center px-3 py-2 text-sm font-medium rounded-md cursor-pointer transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                )}
              >
                <item.icon
                  className={cn(
                    "mr-3 h-4 w-4 flex-shrink-0",
                    isActive ? "text-primary" : "text-muted-foreground group-hover:text-sidebar-foreground"
                  )}
                  aria-hidden="true"
                />
                {item.name}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}