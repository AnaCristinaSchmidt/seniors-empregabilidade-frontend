import type { WorkMode } from "./job-posting-schema";
import type { JobStatus } from "./jobs-api";

export const workModeLabels: Record<WorkMode, string> = {
  onsite: "Presencial",
  hybrid: "Híbrido",
  remote: "Remoto",
};

export const jobStatusLabels: Record<JobStatus, string> = {
  draft: "Rascunho",
  under_review: "Em análise",
  published: "Aberta",
  paused: "Pausada",
  expired: "Expirada",
  closed: "Encerrada",
};

/** "2026-12-31" → "31/12/2026", without a time zone shifting the day. */
export function formatIsoDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}
