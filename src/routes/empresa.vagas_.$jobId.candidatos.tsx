import { createFileRoute } from "@tanstack/react-router";

import { ProfessionalRankingPage } from "@/features/professional-ranking/professional-ranking-page.tsx";

// requireRole("company") roda na rota pai (empresa.tsx).
// O "_" depois de "vagas" evita aninhar esta rota dentro de empresa.vagas.tsx,
// então a lista "Minhas vagas" não precisa de <Outlet />.
export const Route = createFileRoute("/empresa/vagas_/$jobId/candidatos")({
  component: () => <ProfessionalRankingPage />,
});
