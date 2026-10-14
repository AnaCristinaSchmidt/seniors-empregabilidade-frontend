import { createFileRoute, Outlet } from "@tanstack/react-router";

import { requireRole } from "@/features/auth/require-role";
import { RoleShell } from "@/features/auth/role-shell";

export const Route = createFileRoute("/administrador")({
  beforeLoad: () => requireRole("administrator"),
  component: () => (
    <RoleShell userType="administrator">
      <Outlet />
    </RoleShell>
  ),
});
