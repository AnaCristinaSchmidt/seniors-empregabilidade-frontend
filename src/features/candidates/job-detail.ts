import { queryOptions } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import { ApiError } from "@/lib/api-error";

import { jobDetailSchema, type JobDetail } from "./job-detail-schema";

export function jobDetailQueryKey(jobId: string) {
  return ["jobs", "detail", jobId] as const;
}

export async function fetchJobDetail(
  jobId: string,
  signal?: AbortSignal,
): Promise<JobDetail> {
  const response = await apiClient.get<unknown>(
    `/jobs/${jobId}`,
    signal ? { signal } : {},
  );
  const parsed = jobDetailSchema.safeParse(response.data);
  if (!parsed.success) {
    throw new ApiError({
      message: "Não foi possível carregar os detalhes da vaga.",
      code: "invalid_job_detail_response",
    });
  }
  return parsed.data;
}

export function jobDetailQueryOptions(jobId: string) {
  return queryOptions({
    queryKey: jobDetailQueryKey(jobId),
    queryFn: ({ signal }) => fetchJobDetail(jobId, signal),
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
  });
}
