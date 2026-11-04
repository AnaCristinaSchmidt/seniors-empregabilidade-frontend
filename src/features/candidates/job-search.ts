import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";

import { apiClient } from "@/lib/api-client";
import { ApiError } from "@/lib/api-error";

import {
  jobSearchResultSchema,
  type JobSearchResult,
} from "./job-search-schema";

const JOBS_ENDPOINT = "/jobs";
const DEFAULT_LIMIT = 20;

export async function fetchJobs(
  search: string,
  signal?: AbortSignal,
  limit: number = DEFAULT_LIMIT,
): Promise<JobSearchResult[]> {
  const params = new URLSearchParams();
  if (search.trim()) {
    params.set("search", search.trim());
  }
  params.set("limit", String(limit));
  params.set("offset", "0");

  const response = await apiClient.get<unknown>(
    `${JOBS_ENDPOINT}?${params.toString()}`,
    signal ? { signal } : undefined,
  );

  const parsed = z.array(jobSearchResultSchema).safeParse(response.data);
  if (!parsed.success) {
    throw new ApiError({
      message: "Não foi possível carregar as vagas.",
      code: "invalid_job_search_response",
    });
  }
  return parsed.data;
}

export function jobSearchQueryOptions(search: string) {
  return queryOptions({
    queryKey: ["jobs", "search", search],
    queryFn: ({ signal }) => fetchJobs(search, signal),
    // Mesmo raciocínio do resto do projeto: uma falha aqui costuma ser
    // contrato/rede, não algo que vale a pena tentar de novo sozinho.
    retry: false,
  });
}
