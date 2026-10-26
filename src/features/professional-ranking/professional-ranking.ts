import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";

import { apiClient } from "@/lib/api-client";
import { ApiError } from "@/lib/api-error";

// Contrato do back: GET /api/v1/jobs/{job_id}/applications
// (app/jobs/router.py, schemas/job_applicants_response.py). Só a empresa dona
// da vaga acessa; vaga de outra empresa responde 404.

// `Decimal` do Pydantic pode chegar como número ou como string.
const percentageSchema = z
  .union([z.number(), z.string()])
  .nullable()
  .transform((value) => (value === null ? null : Number(value)))
  .pipe(z.number().min(0).max(100).nullable());

const applicantProfileSchema = z.object({
  candidate_id: z.string(),
  full_name: z.string(),
  city: z.string().nullable(),
  state: z.string().nullable(),
});

// Competências da vaga que o currículo tem (matched) ou não tem (missing),
// ordenadas por nome pelo back. Vazias quando a vaga não tem requisitos.
const compatibilitySkillSchema = z.object({
  id: z.string(),
  name: z.string(),
});

// application: o profissional se candidatou. automatic_match: perfil compatível
// (50% ou mais) que não se candidatou. A origem não altera o percentual.
export const applicantOriginSchema = z.enum(["application", "automatic_match"]);

export const jobApplicantSchema = z.object({
  origin: applicantOriginSchema,
  // Nulos em um match automático (não há candidatura).
  application_id: z.string().nullable(),
  status: z.string().nullable(),
  match_score: z.number().nullable(),
  // 0 a 100, duas casas. null quando a vaga não tem requisitos.
  compatibility_percentage: percentageSchema,
  is_highlighted: z.boolean(),
  matched_skill_count: z.number().int(),
  required_skill_count: z.number().int(),
  // Default vazio enquanto um back sem os nomes (anterior ao #55) estiver no ar.
  matched_skills: z.array(compatibilitySkillSchema).default([]),
  missing_skills: z.array(compatibilitySkillSchema).default([]),
  profile: applicantProfileSchema,
});

export const jobApplicantsSchema = z.object({
  job_id: z.string(),
  total_applicant_count: z.number().int(),
  full_match_count: z.number().int(),
  automatic_match_count: z.number().int(),
  applicants: z.array(jobApplicantSchema),
});

export type ApplicantOrigin = z.infer<typeof applicantOriginSchema>;
export type JobApplicant = z.infer<typeof jobApplicantSchema>;
export type JobApplicants = z.infer<typeof jobApplicantsSchema>;

export const HIGHLIGHT_THRESHOLD = 50;

// O back já devolve ordenado (destacados primeiro, maior percentual primeiro,
// empate pela candidatura mais antiga). Reordenamos aqui só para a tela nunca
// depender disso; o sort é estável, então o desempate do back é mantido.
// Quem não tem percentual (vaga sem requisitos) fica por último.
export function sortByCompatibility(
  applicants: JobApplicant[],
): JobApplicant[] {
  return [...applicants].sort((a, b) => {
    const left = a.compatibility_percentage;
    const right = b.compatibility_percentage;

    if (left === right) return 0;
    if (left === null) return 1;
    if (right === null) return -1;

    return right - left;
  });
}

const JOBS_ENDPOINT = "/jobs";

export async function fetchJobApplicants(
  jobId: string,
  signal?: AbortSignal,
): Promise<JobApplicants> {
  const response = await apiClient.get<unknown>(
    `${JOBS_ENDPOINT}/${encodeURIComponent(jobId)}/applications`,
    signal ? { signal } : undefined,
  );

  const parsed = jobApplicantsSchema.safeParse(response.data);
  if (!parsed.success) {
    throw new ApiError({
      message: "Não foi possível carregar os candidatos da vaga.",
      code: "invalid_job_applicants_response",
    });
  }
  return parsed.data;
}

export function jobApplicantsQueryOptions(jobId: string) {
  return queryOptions({
    queryKey: ["jobs", jobId, "applicants"],
    queryFn: ({ signal }) => fetchJobApplicants(jobId, signal),
    // Falha aqui costuma ser contrato/rede ou vaga de outra empresa (404).
    retry: false,
  });
}
