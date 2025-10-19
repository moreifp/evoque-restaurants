import { Link, useLocation } from "react-router-dom";
import { Home, UtensilsCrossed, BookImage, User, LogOut, Users, ExternalLink, Wine } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import evoqueLogo from "@/assets/evoque-logo.svg";

export const Navigation = () => {
  const location = useLocation();
  const { toast } = useToast();

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast({
        title: "Error signing out",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Signed out successfully",
      });
    }
  };

  const navItems = [
    { path: "/", icon: Home, label: "Home" },
    { path: "/dining", icon: UtensilsCrossed, label: "DiningOut" },
    { path: "/albums", icon: BookImage, label: "Albums" },
    { path: "/wine-cellar", icon: Wine, label: "Wine Cellar" },
    { path: "/following", icon: Users, label: "Social" },
    { path: "/profile", icon: User, label: "Profile" },
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

            <Button variant="ghost" className="flex items-center space-x-2" asChild>
              <a href="https://evoque.guru/" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" />
                <span>Website</span>
              </a>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center space-x-2">
                  <span>Legal</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <a
                    href="https://evoque.guru/#page-0"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center"
                  >
                    <span>Terms of Use</span>
                    <ExternalLink className="h-3 w-3 ml-2" />
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a
                    href="https://evoque.guru/#page-0"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center"
                  >
                    <span>Privacy Policy</span>
                    <ExternalLink className="h-3 w-3 ml-2" />
                  </a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button variant="ghost" size="icon" onClick={handleSignOut} className="ml-2">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>

          {/* Mobile Navigation */}
          <div className="md:hidden flex items-center">
            <Button variant="ghost" size="icon" onClick={handleSignOut}>
              <LogOut className="h-4 w-4" />
            </Button>
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
