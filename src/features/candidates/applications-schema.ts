import { z } from "zod";

import { apiClient } from "@/lib/api-client";
import { applicationStatusSchema } from "@/lib/application-status";
import { toApiError } from "@/lib/api-error";

export {
  applicationStatusSchema,
  type ApplicationStatus,
} from "@/lib/application-status";

export const searchSchema = z.object({
  search: z
    .string()
    .trim()
    .max(200, {
      message: "O nome da empresa deve ter no máximo 200 caracteres.",
    })
    .optional(),
});

export type SearchForm = z.infer<typeof searchSchema>;

const similarJobSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  company_name: z.string(),
});

export const applicationSchema = z.object({
  id: z.string().uuid(),
  job_id: z.string().uuid(),
  job_title: z.string(),
  company_name: z.string(),
  submitted_at: z.string().datetime({ offset: true }),
  days_in_process: z.number().int().nonnegative(),
  status: applicationStatusSchema,
  reason: z.string().nullable().optional(),
  similar_jobs: z.array(similarJobSchema),
});

export const applicationsResponseSchema = z.array(applicationSchema);

export type Application = z.infer<typeof applicationSchema>;

interface FetchApplicationsParams {
  companyName?: string;
  signal?: AbortSignal;
}

export async function fetchApplications({
  companyName,
  signal,
}: FetchApplicationsParams = {}): Promise<Application[]> {
  const response = await apiClient.get<unknown>("/applications/me", {
    ...(companyName ? { params: { company_name: companyName } } : {}),
    ...(signal ? { signal } : {}),
  });

  try {
    return applicationsResponseSchema.parse(response.data);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function withdrawApplication(id: string): Promise<Application> {
  const response = await apiClient.post<unknown>(
    `/applications/${id}/withdraw`,
  );
  try {
    const application = applicationSchema.parse(response.data);
    if (application.id !== id || application.status !== "withdrawn") {
      throw new Error("Unexpected withdrawal response");
    }
    return application;
  } catch (error) {
    throw toApiError(error);
  }
}
