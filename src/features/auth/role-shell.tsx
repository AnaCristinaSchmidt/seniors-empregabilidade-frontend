import type { ReactNode } from "react";

import { RoleHeader } from "./role-header";
import type { UserType } from "./schema";
import { Sidebar } from "./sidebar";
import { SupportWhatsAppButton } from "./support-whatsapp-button";

interface RoleShellProps {
  userType: UserType;
  /** Header control supplied by the route, such as the notifications link. */
  headerAction?: ReactNode;
  children: ReactNode;
}

export function RoleShell({
  userType,
  headerAction,
  children,
}: RoleShellProps) {
  // The candidate area always had the greeting; other areas show the header
  // only when they have something to put in it.
  const showHeader = userType === "candidate" || headerAction !== undefined;

  return (
    <div className="flex min-h-svh flex-col bg-background sm:flex-row">
      <Sidebar userType={userType} />

      <div className="flex flex-1 flex-col">
        {showHeader ? <RoleHeader action={headerAction} /> : null}
        <main className="flex-1">{children}</main>
      </div>

      <SupportWhatsAppButton />
    </div>
  );
}
