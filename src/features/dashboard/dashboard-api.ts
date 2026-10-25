import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";

import { apiClient } from "@/lib/api-client";

export interface DashboardFilters {
  start_date: string;
  end_date: string;
  account_status: string;
  candidate_availability: string;
  company_status: string;
  job_status: string;
  application_status: string;
}
export const emptyDashboardFilters: DashboardFilters = {
  start_date: "",
  end_date: "",
  account_status: "",
  candidate_availability: "",
  company_status: "",
  job_status: "",
  application_status: "",
};
export const dashboardSchema = z.object({
  filters: z.object({
    start_date: z.iso.date().nullable(),
    end_date: z.iso.date().nullable(),
    account_status: z.enum(["active", "blocked", "suspended"]).nullable(),
    candidate_availability: z.enum(["available", "unavailable"]).nullable(),
    company_status: z
      .enum(["pending", "approved", "rejected", "blocked"])
      .nullable(),
    job_status: z
      .enum([
        "draft",
        "under_review",
        "published",
        "paused",
        "expired",
        "closed",
      ])
      .nullable(),
    application_status: z
      .enum([
        "applied",
        "under_review",
        "in_selection_process",
        "hired",
        "not_selected",
        "withdrawn",
        "expired",
      ])
      .nullable(),
  }),
  totals: z.object({
    candidates: z.number().int().nonnegative(),
    companies: z.number().int().nonnegative(),
    jobs: z.number().int().nonnegative(),
    applications: z.number().int().nonnegative(),
    matches: z.number().int().nonnegative(),
  }),
  segments: z.object({
    candidates_without_placement: z.number().int().nonnegative(),
    candidates_with_unknown_employment: z.number().int().nonnegative(),
    incomplete_resumes: z.number().int().nonnegative(),
  }),
});
export function dashboardParams(filters: DashboardFilters): URLSearchParams {
  const params = new URLSearchParams();
  for (const name of Object.keys(filters) as (keyof DashboardFilters)[]) {
    const value = filters[name];
    if (value) params.set(name, value);
  }
  return params;
}
export function dashboardQueryOptions(filters: DashboardFilters) {
  const search = dashboardParams(filters).toString();
  return queryOptions({
    queryKey: ["administrator", "dashboard", search],
    queryFn: async ({ signal }) =>
      dashboardSchema.parse(
        (
          await apiClient.get<unknown>(
            `/indicators${search ? `?${search}` : ""}`,
            { signal },
          )
        ).data,
      ),
    retry: false,
  });
}
