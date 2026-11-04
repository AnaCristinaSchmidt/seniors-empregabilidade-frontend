import { createFileRoute } from "@tanstack/react-router";

import { CandidateHome } from "@/features/candidates/candidate-home";

export const Route = createFileRoute("/candidato/")({
  component: () => <CandidateHome />,
});
