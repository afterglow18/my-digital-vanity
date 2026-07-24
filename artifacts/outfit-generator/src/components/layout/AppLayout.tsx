import React from "react";
import { Link, useLocation } from "wouter";
import { Shirt, Sparkles, Bookmark, UserCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGetWardrobeStats } from "@/hooks/useLocalWardrobe";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [location] = useLocation();
  const { data: stats } = useGetWardrobeStats();

  const wardrobeCount = stats?.total ?? undefined;

  const navItems = [
    { href: "/",         label: "Vanity",   icon: Shirt,    badge: wardrobeCount },
    { href: "/generate", label: "Generate", icon: Sparkles },
    { href: "/saved",    label: "Saved",    icon: Bookmark },
    { href: "/backup",   label: "Account",  icon: UserCircle },
  ];

  return (
    <div className="min-h-[100dvh] w-full bg-[#f8f9fa] sm:bg-[#F4D6DD] flex justify-center 2xl:py-8 2xl:px-4">
      {/* Phone Frame: fluid column on all iPads, phone-frame only on wide desktop (≥1536px) */}
      <div className="w-full max-w-md bg-background h-[100dvh] sm:shadow-2xl sm:border-x sm:border-black/[0.07] 2xl:min-h-[850px] 2xl:h-[850px] 2xl:border-[6px] 2xl:border-black 2xl:rounded-[3rem] 2xl:shadow-2xl relative overflow-hidden flex flex-col 2xl:overflow-y-auto">

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto pb-[90px] relative">
          {children}
        </main>

        {/* Bottom Navigation */}
        <nav className="absolute bottom-0 left-0 right-0 bg-white border-t-[3px] border-black p-3 pb-safe z-[40]">
          <ul className="flex items-center justify-around">
            {navItems.map((item) => {
              const isActive = location === item.href;
              const Icon = item.icon;
              return (
                <li key={item.href} className="relative">
                  <Link href={item.href} className="flex flex-col items-center gap-1 group">
                    <div
                      className={cn(
                        "p-2.5 rounded-full border-2 transition-all duration-200 ease-spring relative",
                        isActive
                          ? "bg-primary border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] -translate-y-1"
                          : "bg-transparent border-transparent group-hover:bg-muted group-active:scale-95",
                      )}
                    >
                      <Icon
                        className={cn(
                          "w-6 h-6",
                          isActive ? "text-black" : "text-muted-foreground",
                          item.href === "/generate" && isActive ? "animate-pulse" : "",
                        )}
                        strokeWidth={isActive ? 2.5 : 2}
                      />

                      {/* Badge */}
                      {item.badge !== undefined && item.badge > 0 && (
                        <div className="absolute -top-2 -right-2 bg-secondary text-black text-[10px] font-bold border-2 border-black w-5 h-5 flex items-center justify-center rounded-full shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]">
                          {item.badge > 99 ? '99+' : item.badge}
                        </div>
                      )}
                    </div>
                    <span
                      className={cn(
                        "text-[10px] font-bold uppercase tracking-wider transition-colors",
                        isActive ? "text-black" : "text-muted-foreground",
                      )}
                    >
                      {item.label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </div>
  );
}
