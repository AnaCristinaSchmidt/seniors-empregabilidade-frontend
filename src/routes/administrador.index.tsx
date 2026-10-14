import { createFileRoute } from "@tanstack/react-router";

import { RoleHomePage } from "@/features/auth/role-home-page";

export const Route = createFileRoute("/administrador/")({
  component: () => <RoleHomePage title="Área do administrador" />,
});
