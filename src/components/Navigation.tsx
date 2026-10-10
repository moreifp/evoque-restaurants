import { Link, useLocation } from "react-router-dom";
import { Home, UtensilsCrossed, Wine, Settings, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/i18n";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import evoqueLogo from "@/assets/evoque-logo.png";

export const Navigation = () => {
  const location = useLocation();
  const { language, setLanguage, t } = useI18n();

  const navItems = [
    { path: "/", icon: Home, label: t("navigation.home"), mobileLabel: t("navigation.home") },
    { path: "/dining", icon: UtensilsCrossed, label: t("navigation.dining"), mobileLabel: t("navigation.dining") },
    { path: "/wine-cellar", icon: Wine, label: t("navigation.wineCellar"), mobileLabel: t("navigation.wine") },
    { path: "/account", icon: Settings, label: t("navigation.account"), mobileLabel: "" },
  ];

  return (
    <>
      {/* Top Navigation Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border pt-safe pl-safe pr-safe">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative flex items-center justify-end h-[4.5rem] md:h-20">
            {/* Logo: símbolo grande, centralizado (único elemento no celular) */}
            <Link
              to="/"
              className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center"
              aria-label="Evoque"
            >
              <img src={evoqueLogo} alt="Evoque" className="h-14 w-14 object-contain md:h-16 md:w-16" />
            </Link>

            {/* Navigation Links + idioma (tablet e desktop) */}
            <div className="hidden md:flex items-center space-x-1">
              {/* Desktop: ícone + texto */}
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
              </div>

              {/* Tablet: só ícones */}
              <div className="flex lg:hidden items-center space-x-1">
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
              </div>

              {/* Language Switcher */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-10 w-10 p-0 lg:h-9 lg:w-auto lg:px-3 lg:ml-2">
                    <Globe className="h-4 w-4 lg:mr-2" />
                    <span className="hidden lg:inline">{language.toUpperCase()}</span>
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
