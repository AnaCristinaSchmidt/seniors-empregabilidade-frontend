import { createFileRoute } from "@tanstack/react-router";

import HowToUsePage from "@/features/candidates/how-to-use";

export const Route = createFileRoute("/candidato/como-usar")({
  component: HowToUsePage,
});
