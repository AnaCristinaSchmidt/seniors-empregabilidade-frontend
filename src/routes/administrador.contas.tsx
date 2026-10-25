import { createFileRoute } from "@tanstack/react-router";

import { AccountsPage } from "@/features/account-management/accounts-page";

// requireRole("administrator") runs in the parent route (administrador.tsx).
export const Route = createFileRoute("/administrador/contas")({
  component: () => <AccountsPage />,
});
