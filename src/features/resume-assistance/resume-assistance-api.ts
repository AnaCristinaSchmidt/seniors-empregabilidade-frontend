import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";

import { apiClient } from "@/lib/api-client";
import { ApiError } from "@/lib/api-error";

// Proposed for US-08-T01; the backend does not serve these routes yet.
const PROFESSIONALS_ENDPOINT = "/professionals";
// shortcut: first page only, add paging when the list outgrows it.
const PAGE_SIZE = 50;

export const NOTE_MAX_LENGTH = 2000;

export type CompletenessFilter = "incomplete" | "complete" | "all";
export type ContactFilter = "all" | "not_contacted" | "contacted";

export interface ResumeFilters {
  completeness: CompletenessFilter;
  contact: ContactFilter;
}

const guidanceSchema = z.object({
  id: z.string(),
  note: z.string(),
  created_at: z.string(),
  administrator_name: z.string(),
});

// missing_fields stays a plain string list so a new backend key does not
// break the whole panel.
const resumeSummarySchema = z.object({
  id: z.string(),
  full_name: z.string(),
  email: z.string(),
  phone: z.string(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  missing_fields: z.array(z.string()),
  last_guidance: guidanceSchema.nullable(),
});

export type Guidance = z.infer<typeof guidanceSchema>;
export type ResumeSummary = z.infer<typeof resumeSummarySchema>;

export const guidanceValuesSchema = z.object({
  note: z
    .string()
    .trim()
    .min(1, { message: "Escreva a orientação antes de salvar." })
    .max(NOTE_MAX_LENGTH, {
      message: `Use até ${NOTE_MAX_LENGTH} caracteres.`,
    }),
});

export type GuidanceValues = z.infer<typeof guidanceValuesSchema>;

const missingFieldLabels: Record<string, string> = {
  city: "Cidade",
  state: "Estado",
  summary: "Resumo profissional",
  experiences: "Experiência profissional",
  education: "Formação",
  skills: "Habilidades",
};

export function missingFieldLabel(field: string): string {
  return missingFieldLabels[field] ?? field;
}

export async function fetchResumes(
  filters: ResumeFilters,
  signal?: AbortSignal,
): Promise<ResumeSummary[]> {
  const params = new URLSearchParams();
  if (filters.completeness !== "all") {
    params.set("completeness", filters.completeness);
  }
  if (filters.contact !== "all") {
    params.set("contact_status", filters.contact);
  }
  params.set("limit", String(PAGE_SIZE));
  params.set("offset", "0");

  const response = await apiClient.get<unknown>(
    `${PROFESSIONALS_ENDPOINT}?${params.toString()}`,
    signal ? { signal } : undefined,
  );
  const parsed = z.array(resumeSummarySchema).safeParse(response.data);
  if (!parsed.success) {
    throw new ApiError({
      message: "Unexpected résumé list response",
      code: "invalid_resume_list_response",
    });
  }
  return parsed.data;
}

export const resumesQueryKey = ["administrator", "resumes"] as const;

export function resumesQueryOptions(filters: ResumeFilters) {
  return queryOptions({
    queryKey: [...resumesQueryKey, filters],
    queryFn: ({ signal }) => fetchResumes(filters, signal),
    retry: false,
  });
}

export async function recordGuidance(
  professionalId: string,
  values: GuidanceValues,
): Promise<Guidance> {
  const response = await apiClient.post<unknown>(
    `${PROFESSIONALS_ENDPOINT}/${professionalId}/guidance`,
    values,
  );
  const parsed = guidanceSchema.safeParse(response.data);
  if (!parsed.success) {
    throw new ApiError({
      message: "Unexpected guidance response",
      code: "invalid_guidance_response",
    });
  }
  return parsed.data;
}

export function resumesErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) {
    return "Apenas administradores podem ver os currículos.";
  }
  return "Não foi possível carregar os currículos. Tente novamente.";
}

export function guidanceErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "professional_not_found") {
      return "Esta pessoa não está mais cadastrada. Atualize a lista.";
    }
    if (error.code === "validation_error") {
      return `Escreva a orientação com até ${NOTE_MAX_LENGTH} caracteres.`;
    }
  }
  return "Não foi possível registrar a orientação. O texto foi mantido; tente novamente.";
}
