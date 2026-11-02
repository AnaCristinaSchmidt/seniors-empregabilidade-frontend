import { createFileRoute } from "@tanstack/react-router";

import { SkillCatalogPage } from "@/features/skills/skill-catalog-page";

// requireRole("administrator") runs in the parent route (administrador.tsx).
export const Route = createFileRoute("/administrador/competencias")({
  component: () => <SkillCatalogPage />,
});
