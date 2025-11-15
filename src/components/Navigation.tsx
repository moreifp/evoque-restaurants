import { Link, useLocation } from "react-router-dom";
import { Home, UtensilsCrossed, Wine, Sparkles, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import evoqueLogo from "@/assets/evoque-logo.svg";

export const Navigation = () => {
  const location = useLocation();

  const navItems = [
    { path: "/", icon: Home, label: "Home" },
    { path: "/dining", icon: UtensilsCrossed, label: "Dining" },
    { path: "/planner", icon: Sparkles, label: "AI Planner" },
    { path: "/wine-cellar", icon: Wine, label: "Wine Cellar" },
    { path: "/account", icon: Settings, label: "Account" },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-2">
            <img src={evoqueLogo} alt="Evoque" className="w-8 h-8" />
            <span className="text-xl font-semibold text-foreground">Evoque</span>
          </Link>

          {/* Navigation Links - Desktop */}
          <div className="hidden md:flex items-center space-x-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link key={item.path} to={item.path}>
                  <Button variant="ghost" className={cn("flex items-center space-x-2", isActive && "bg-secondary")}>
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Button>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Mobile Bottom Nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-lg border-t border-border pb-safe">
        <div className="flex items-center justify-around h-16">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link key={item.path} to={item.path} className="flex flex-col items-center justify-center flex-1 h-full">
                <Icon className={cn("h-5 w-5 mb-1", isActive ? "text-accent" : "text-muted-foreground")} />
                <span className={cn("text-xs", isActive ? "text-accent font-medium" : "text-muted-foreground")}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
};
