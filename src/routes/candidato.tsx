import { createFileRoute, Outlet } from "@tanstack/react-router";

import { requireRole } from "@/features/auth/require-role";
import { RoleShell } from "@/features/auth/role-shell";
import { NotificationsButton } from "@/features/notifications/notifications-button";

export const Route = createFileRoute("/candidato")({
  beforeLoad: () => requireRole("candidate"),
  component: () => (
    <RoleShell
      userType="candidate"
      headerAction={<NotificationsButton to="/candidato/notificacoes" />}
    >
      <Outlet />
    </RoleShell>
  ),
});
