import { z } from "zod";

// Mesmo shape do skillSchema em features/candidates — duplicado aqui de
// propósito, pra essa feature não depender de outra (mesma convenção do
// resto do projeto, que evita import cruzado entre features).
const skillSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["hard", "soft"]),
});

// Bate com o enum WorkMode do backend (app/db/models/enums.py).
export const workModeSchema = z.enum(["onsite", "hybrid", "remote"]);
export type WorkMode = z.infer<typeof workModeSchema>;

// Decimal do Python pode chegar como número ou como string no JSON,
// dependendo da configuração de serialização do Pydantic — aceitamos os
// dois e normalizamos pra number.
const decimalAsNumber = z
  .union([z.string(), z.number()])
  .transform((value) => (typeof value === "string" ? Number(value) : value));

export const jobSearchResultSchema = z.object({
  id: z.string(),
  title: z.string(),
  company_name: z.string(),
  // Read live from the company profile (US-30). Absent while a backend without
  // these fields is deployed.
  company_industry: z.string().nullish(),
  company_city: z.string().nullish(),
  location: z.string().nullable(),
  work_mode: workModeSchema,
  salary_max: decimalAsNumber.nullable(),
  published_at: z.string().nullable(),
  days_since_published: z.number().int().nullable(),
  matched_skill_count: z.number().int(),
  required_skill_count: z.number().int(),
  missing_skills: z.array(skillSchema),
});

export type JobSearchResult = z.infer<typeof jobSearchResultSchema>;
