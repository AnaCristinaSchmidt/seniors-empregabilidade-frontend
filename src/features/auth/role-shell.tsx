import type { ReactNode } from "react";

import { RoleHeader } from "./role-header";
import type { UserType } from "./schema";
import { Sidebar } from "./sidebar";
import { SupportWhatsAppButton } from "./support-whatsapp-button";

interface RoleShellProps {
  userType: UserType;
  children: ReactNode;
}

export function RoleShell({ userType, children }: RoleShellProps) {
  return (
    <div className="flex min-h-svh flex-col bg-background sm:flex-row">
      <Sidebar userType={userType} />

      <div className="flex min-w-0 flex-1 flex-col">
        {userType === "candidate" ? <RoleHeader /> : null}
        <main className="flex-1">{children}</main>
      </div>

      <SupportWhatsAppButton />
    </div>
  );
}
