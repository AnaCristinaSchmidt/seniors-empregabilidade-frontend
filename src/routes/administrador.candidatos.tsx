import { createFileRoute } from "@tanstack/react-router";

import { IncompleteResumesPage } from "@/features/resume-assistance/incomplete-resumes-page";

// requireRole("administrator") runs in the parent route (administrador.tsx).
export const Route = createFileRoute("/administrador/candidatos")({
  component: () => <IncompleteResumesPage />,
});
