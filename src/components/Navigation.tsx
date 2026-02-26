import { Link, useLocation } from "react-router-dom";
import { Home, UtensilsCrossed, Wine, Calendar, Settings, Globe, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/i18n";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import evoqueLogo from "@/assets/evoque-logo.svg";
import { NotificationBell } from "@/components/NotificationBell";

export const Navigation = () => {
  const location = useLocation();
  const { language, setLanguage, t } = useI18n();

  const navItems = [
    { path: "/", icon: Home, label: t("navigation.home"), mobileLabel: t("navigation.home") },
    { path: "/dining", icon: UtensilsCrossed, label: t("navigation.dining"), mobileLabel: t("navigation.dining") },
    { path: "/agenda", icon: Calendar, label: t("navigation.agenda"), mobileLabel: "Agenda" },
    { path: "/social", icon: Users, label: t("navigation.social"), mobileLabel: t("navigation.social") },
    { path: "/wine-cellar", icon: Wine, label: t("navigation.wineCellar"), mobileLabel: t("navigation.wine") },
    { path: "/account", icon: Settings, label: t("navigation.account"), mobileLabel: "" },
  ];

  return (
    <>
      {/* Top Navigation Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border pt-safe pl-safe pr-safe">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            {/* Logo */}
            <Link to="/" className="flex items-center space-x-2">
              <img src={evoqueLogo} alt="Evoque" className="w-8 h-8" />
              <span className="text-xl font-semibold text-foreground">Evoque</span>
            </Link>

            {/* Navigation Links - Desktop */}
            <div className="hidden lg:flex items-center space-x-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                // Check if current path starts with the nav item path (for parent route highlighting)
                const isActive = item.path === "/" 
                  ? location.pathname === "/" 
                  : location.pathname === item.path || location.pathname.startsWith(item.path + "/");
                return (
                  <Link key={item.path} to={item.path}>
                    <Button variant="ghost" className={cn("flex items-center space-x-2", isActive && "bg-secondary")}>
                      <Icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </Button>
                  </Link>
                );
              })}
              
              {/* Notification Bell */}
              <NotificationBell />

              {/* Language Switcher */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="ml-2">
                    <Globe className="h-4 w-4 mr-2" />
                    {language.toUpperCase()}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-background/95 backdrop-blur-lg">
                  <DropdownMenuItem onClick={() => setLanguage("en")} className="cursor-pointer">
                    🇺🇸 English
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setLanguage("pt")} className="cursor-pointer">
                    🇧🇷 Português
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Navigation Links - Tablet (icons only) */}
            <div className="hidden md:flex lg:hidden items-center space-x-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = item.path === "/" 
                  ? location.pathname === "/" 
                  : location.pathname === item.path || location.pathname.startsWith(item.path + "/");
                return (
                  <Link key={item.path} to={item.path}>
                    <Button variant="ghost" size="icon" className={cn(isActive && "bg-secondary")}>
                      <Icon className="h-4 w-4" />
                    </Button>
                  </Link>
                );
              })}
              
              {/* Notification Bell */}
              <NotificationBell />

              {/* Language Switcher */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <Globe className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-background/95 backdrop-blur-lg">
                  <DropdownMenuItem onClick={() => setLanguage("en")} className="cursor-pointer">
                    🇺🇸 English
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setLanguage("pt")} className="cursor-pointer">
                    🇧🇷 Português
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Navigation - Separate from header to avoid blur nesting issues */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-lg border-t border-border pb-safe pl-safe pr-safe">
        <div className="flex items-center justify-around h-14">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.path === "/" 
              ? location.pathname === "/" 
              : location.pathname === item.path || location.pathname.startsWith(item.path + "/");
            return (
              <Link key={item.path} to={item.path} className="flex flex-col items-center justify-center flex-1 h-full">
                <Icon className={cn("h-5 w-5", item.mobileLabel && "mb-1", isActive ? "text-accent" : "text-muted-foreground")} />
                {item.mobileLabel && (
                  <span className={cn("text-xs", isActive ? "text-accent font-medium" : "text-muted-foreground")}>
                    {item.mobileLabel}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
};
