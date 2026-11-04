import { apiClient } from "@/lib/api-client";
import { ApiError } from "@/lib/api-error";

import {
  jobApplicationSchema,
  type JobApplication,
} from "./job-vacancy-schema";

export type { JobApplication };

export async function applyToJobVacancy(
  jobPostingId: string,
  signal?: AbortSignal,
): Promise<JobApplication> {
  // POST /applications (US-13) takes the job in the body; the backend has no
  // per-job application route.
  const response = await apiClient.post<unknown>(
    "/applications",
    { job_id: jobPostingId },
    signal ? { signal } : {},
  );

  const parsed = jobApplicationSchema.safeParse(response.data);

  if (!parsed.success) {
    throw new ApiError({
      message: "Não foi possível validar a resposta da candidatura.",
      code: "invalid_job_application_response",
    });
  }

  return parsed.data;
}
