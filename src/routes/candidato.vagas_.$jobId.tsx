import { createFileRoute } from "@tanstack/react-router";

import { CandidateJobDetailPage } from "@/features/candidates/job-vacancy-detail-page";

// The "_" after "vagas" keeps this screen out of candidato.vagas.tsx, so the
// search page does not need an Outlet. The URL is still /candidato/vagas/$jobId.
export const Route = createFileRoute("/candidato/vagas_/$jobId")({
  component: () => <CandidateJobDetailPage />,
});
