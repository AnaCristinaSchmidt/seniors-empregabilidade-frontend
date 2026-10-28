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
