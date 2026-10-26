import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";

import { apiClient } from "@/lib/api-client";
import { ApiError } from "@/lib/api-error";
import { applicationStatusSchema } from "./application-status";

// Pydantic decimals may arrive as a number or a string.
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

export const applicantOriginSchema = z.enum(["application", "automatic_match"]);

const applicantFields = {
  compatibility_percentage: percentageSchema,
  is_highlighted: z.boolean(),
  matched_skill_count: z.number().int().nonnegative(),
  required_skill_count: z.number().int().nonnegative(),
  matched_skills: z
    .array(z.object({ id: z.string(), name: z.string() }))
    .default([]),
  missing_skills: z
    .array(z.object({ id: z.string(), name: z.string() }))
    .default([]),
  profile: applicantProfileSchema,
};

export const jobApplicantSchema = z.discriminatedUnion("origin", [
  z.object({
    ...applicantFields,
    origin: z.literal("application"),
    application_id: z.string().min(1),
    status: applicationStatusSchema,
    match_score: z.number().nullable(),
  }),
  z.object({
    ...applicantFields,
    origin: z.literal("automatic_match"),
    application_id: z.null(),
    status: z.null(),
    match_score: z.null(),
  }),
]);

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

// Keep the backend tie order; a job without requirements has no percentage.
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
  if (!parsed.success || parsed.data.job_id !== jobId) {
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
    retry: false,
  });
}
