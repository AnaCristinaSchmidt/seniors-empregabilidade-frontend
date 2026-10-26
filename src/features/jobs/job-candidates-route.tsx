import { getRouteApi } from "@tanstack/react-router";

import { candidateManagementSearchSchema } from "./job-candidates-api";
import { JobCandidatesPage } from "./job-candidates-page";

const routeApi = getRouteApi("/empresa/candidatos");

export function JobCandidatesRoute() {
  const search: unknown = routeApi.useSearch();
  const { jobId } = candidateManagementSearchSchema.parse(search);
  return <JobCandidatesPage key={jobId ?? "all"} initialJobId={jobId} />;
}
