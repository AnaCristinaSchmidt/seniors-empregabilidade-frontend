import { z } from "zod";

export const jobDetailSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  description: z.string(),
  company_id: z.uuid(),
  company_name: z.string(),
  skills: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      type: z.enum(["hard", "soft"]),
    }),
  ),
  work_mode: z.enum(["onsite", "hybrid", "remote"]),
  location: z.string().nullable(),
  closing_date: z.iso.date(),
  status: z.enum([
    "draft",
    "under_review",
    "published",
    "paused",
    "expired",
    "closed",
  ]),
  published_at: z.iso.datetime({ offset: true }).nullable(),
  already_applied: z.boolean(),
  is_open: z.boolean(),
  is_expired: z.boolean(),
  is_applicable: z.boolean(),
});

export type JobDetail = z.infer<typeof jobDetailSchema>;
