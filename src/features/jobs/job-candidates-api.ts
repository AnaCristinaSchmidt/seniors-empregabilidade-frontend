import { z } from "zod";

import { ApiError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client";

import { applicationStatusSchema } from "@/lib/application-status";
import { type JobApplicant as RankedApplicant } from "@/lib/job-applicants";

export { fetchJobApplicants, type JobApplicants } from "@/lib/job-applicants";
export type { ApplicationStatus } from "@/lib/application-status";
export type JobApplicant = Extract<RankedApplicant, { origin: "application" }>;

export function isApplication(
  applicant: RankedApplicant,
): applicant is JobApplicant {
  return applicant.origin === "application";
}

export const candidateManagementSearchSchema = z.object({
  jobId: z.uuid().optional(),
});

const applicantDetailSchema = z.object({
  application_id: z.uuid(),
  candidate_id: z.uuid(),
  full_name: z.string(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  summary: z.string().nullable(),
  experiences: z.array(
    z.object({
      id: z.uuid(),
      role: z.string(),
      company_name: z.string(),
      start_date: z.iso.date(),
      end_date: z.iso.date().nullable(),
      description: z.string().nullable(),
    }),
  ),
  education: z.array(
    z.object({
      id: z.uuid(),
      institution: z.string(),
      degree: z.string().nullable(),
      field: z.string().nullable(),
      start_date: z.iso.date().nullable(),
      end_date: z.iso.date().nullable(),
    }),
  ),
  certifications: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      issuer: z.string().nullable(),
      issued_date: z.iso.date().nullable(),
      expiration_date: z.iso.date().nullable(),
    }),
  ),
  skills: z.array(
    z.object({ id: z.uuid(), name: z.string(), type: z.string() }),
  ),
});

export type ApplicantDetail = z.infer<typeof applicantDetailSchema>;

export async function fetchApplicantDetail(
  applicationId: string,
  signal?: AbortSignal,
): Promise<ApplicantDetail> {
  const response = await apiClient.get<unknown>(
    `/applications/${applicationId}/profile`,
    signal ? { signal } : {},
  );
  const parsed = applicantDetailSchema.safeParse(response.data);
  if (!parsed.success || parsed.data.application_id !== applicationId) {
    throw new ApiError({
      message: "Não foi possível validar o perfil do candidato.",
      code: "invalid_applicant_profile_response",
    });
  }
  return parsed.data;
}

const applicationActionSchema = z.object({
  application_id: z.uuid(),
  job_id: z.uuid(),
  candidate_id: z.uuid(),
  status: applicationStatusSchema,
  updated_at: z.iso.datetime({ offset: true }),
});

export type CompanyActionStatus =
  "under_review" | "in_selection_process" | "hired" | "not_selected";

export async function changeApplicationStatus({
  applicationId,
  status,
  reason,
}: {
  applicationId: string;
  status: CompanyActionStatus;
  reason?: string;
}) {
  const response = await apiClient.patch<unknown>(
    `/applications/${applicationId}/status`,
    { status, ...(reason ? { reason } : {}) },
  );
  const parsed = applicationActionSchema.safeParse(response.data);
  if (
    !parsed.success ||
    parsed.data.application_id !== applicationId ||
    parsed.data.status !== status
  ) {
    throw new ApiError({
      message: "Não foi possível validar a atualização da candidatura.",
      code: "invalid_application_action_response",
    });
  }
  return parsed.data;
}
