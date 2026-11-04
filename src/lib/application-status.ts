import { z } from "zod";

export const applicationStatusSchema = z.enum([
  "applied",
  "under_review",
  "in_selection_process",
  "hired",
  "not_selected",
  "withdrawn",
  "expired",
]);

export type ApplicationStatus = z.infer<typeof applicationStatusSchema>;

export function applicationStatusLabel(status: ApplicationStatus): string {
  switch (status) {
    case "applied":
      return "Candidatura enviada";

    case "under_review":
      return "Em análise";

    case "in_selection_process":
      return "Em processo seletivo";

    case "hired":
      return "Você foi selecionado";

    case "not_selected":
      return "Você não foi selecionado";

    case "withdrawn":
      return "Você saiu do processo seletivo";

    case "expired":
      return "Candidatura expirada";
  }
}
