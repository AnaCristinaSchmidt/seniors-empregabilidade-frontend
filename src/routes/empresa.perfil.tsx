import { createFileRoute } from "@tanstack/react-router";

import { CompanyProfilePage } from "@/features/companies/company-profile-page";

// requireRole("company") runs in the parent route (empresa.tsx). The page
// itself handles a company that is not approved yet, which the API refuses.
export const Route = createFileRoute("/empresa/perfil")({
  component: () => <CompanyProfilePage />,
});
