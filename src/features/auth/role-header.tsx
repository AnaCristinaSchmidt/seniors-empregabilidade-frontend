import type { ReactNode } from "react";

interface RoleHeaderProps {
  /** Rendered on the right; the route supplies it so this feature stays
      independent of the features it shows (such as notifications). */
  action?: ReactNode;
}

export function RoleHeader({ action }: RoleHeaderProps) {
  return (
    <header className="flex items-center justify-between border-b border-border bg-background px-8 py-5">
      <p className="text-xl font-semibold text-foreground">Olá!</p>
      {action}
    </header>
  );
}
