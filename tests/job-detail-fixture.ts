import type { JobDetail } from "@/features/candidates/job-detail-schema";

export const jobDetail: JobDetail = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Operations supervisor",
  description: "Coordinate daily operations and support the team.",
  company_id: "22222222-2222-4222-8222-222222222222",
  company_name: "Example Company",
  skills: [
    {
      id: "33333333-3333-4333-8333-333333333333",
      name: "Spreadsheets",
      type: "hard",
    },
    {
      id: "44444444-4444-4444-8444-444444444444",
      name: "Teamwork",
      type: "soft",
    },
  ],
  work_mode: "hybrid",
  location: "Example City",
  closing_date: "2026-12-31",
  status: "published",
  published_at: "2026-10-01T12:00:00Z",
  already_applied: false,
  is_open: true,
  is_expired: false,
  is_applicable: true,
};
