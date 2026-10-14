import { Link, useLocation, useRouter } from "@tanstack/react-router";
import { LogOut } from "lucide-react";

import { queryClient } from "@/lib/query-client";
import { clearSession } from "@/lib/session-storage";

import type { UserType } from "./schema";

const sidebarSubtitle: Record<UserType, string> = {
  candidate: "Área do candidato",
  company: "Área da empresa",
  administrator: "Administração",
};

interface NavItem {
  label: string;
  to?: string;
}

// Only an item with a real page behind it gets a destination — the rest
// stay static text (no aria-current, not focusable) until their pages ship.
const roleNavItems: Record<UserType, NavItem[]> = {
  candidate: [
    { label: "Relatórios", to: "/candidato" },
    { label: "Vagas", to: "/candidato/vagas" },
    { label: "Candidaturas", to: "/candidato/candidaturas" },
    { label: "Capacitação" },
    { label: "Como usar" },
    { label: "Meu perfil", to: "/candidato/perfil" },
  ],
  company: [
    { label: "Relatórios" },
    { label: "Minhas vagas", to: "/empresa/vagas" },
    { label: "Perfil" },
  ],
  administrator: [
    { label: "Relatórios" },
    { label: "Empresas" },
    { label: "Candidatos", to: "/administrador/candidatos" },
    { label: "Capacitação" },
  ],
};

const activeItemClassName =
  "flex min-h-11 w-full items-center rounded-md bg-background px-3 text-base font-medium text-foreground";
const inactiveItemClassName =
  "flex min-h-11 w-full items-center rounded-md px-3 text-base font-medium text-on-dark-subtle";
const linkItemClassName =
  "transition-colors hover:bg-white/5 hover:text-on-dark focus-visible:ring-3 focus-visible:ring-on-dark focus-visible:outline-none";

interface SidebarProps {
  userType: UserType;
}

export function Sidebar({ userType }: SidebarProps) {
  const router = useRouter();
  const { pathname } = useLocation();

  function handleSignOut() {
    clearSession();
    // Clears the whole cache, not just the current-user key, so a previous
    // account's data (profile, job postings, …) can't leak into whoever
    // signs in next in this same tab.
    queryClient.clear();
    void router.navigate({ href: "/login" });
  }

  const navItems = roleNavItems[userType];

  return (
    <aside className="flex w-full flex-col justify-between bg-foreground px-5 py-6 sm:w-64 sm:shrink-0">
      <div>
        <p className="text-xl font-bold text-on-dark">Seniors</p>
        <p className="mt-1 text-base text-on-dark-subtle">
          {sidebarSubtitle[userType]}
        </p>

        <nav aria-label="Principal" className="mt-8">
          <ul className="flex flex-col gap-1">
            {navItems.map((item) => {
              const isActive = item.to !== undefined && pathname === item.to;

              if (item.to === undefined) {
                // Static for now: no page behind this label yet, so it is
                // not a focusable control and carries no aria-current —
                // turn it into a real link once its route ships.
                return (
                  <li key={item.label}>
                    <span className={inactiveItemClassName}>{item.label}</span>
                  </li>
                );
              }

              return (
                <li key={item.label}>
                  <Link
                    to={item.to}
                    aria-current={isActive ? "page" : undefined}
                    className={
                      isActive
                        ? activeItemClassName
                        : `${inactiveItemClassName} ${linkItemClassName}`
                    }
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>

      <div className="border-t border-on-dark-muted/20 pt-4">
        <button
          type="button"
          className="flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-base font-medium text-on-dark-subtle transition-colors hover:bg-white/5 hover:text-on-dark focus-visible:ring-3 focus-visible:ring-on-dark focus-visible:outline-none"
          onClick={handleSignOut}
        >
          <LogOut aria-hidden="true" className="size-5" />
          Sair
        </button>
      </div>
    </aside>
  );
}
