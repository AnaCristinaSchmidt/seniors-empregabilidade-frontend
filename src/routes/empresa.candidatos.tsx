import { createFileRoute } from "@tanstack/react-router";

import { candidateManagementSearchSchema } from "@/features/jobs/job-candidates-api";
import { JobCandidatesRoute } from "@/features/jobs/job-candidates-route";

export const Route = createFileRoute("/empresa/candidatos")({
  validateSearch: (search) => candidateManagementSearchSchema.parse(search),
  component: JobCandidatesRoute,
});
