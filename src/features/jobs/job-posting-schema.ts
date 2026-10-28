import { z } from "zod";

import { skillTypes } from "@/lib/skill-type";

// Mirrors the backend catalog: a name is compared after its normalized form is
// capped at 100 characters, and a job accepts at most 100 skills.
export const MAX_SKILL_NAME_LENGTH = 100;
const MAX_SKILLS = 100;

export const workModes = ["onsite", "hybrid", "remote"] as const;
export const workModeSchema = z.enum(workModes);
export type WorkMode = z.infer<typeof workModeSchema>;

export const skillTypeSchema = z.enum(skillTypes);
export type SkillType = z.infer<typeof skillTypeSchema>;

const required = (max: number) =>
  z
    .string()
    .trim()
    .min(1, "Preencha este campo.")
    .max(max, `Use até ${max} caracteres.`);

export const jobSkillSchema = z.object({
  name: z.string().trim().min(1).max(MAX_SKILL_NAME_LENGTH),
  type: skillTypeSchema,
});

export type JobSkill = z.infer<typeof jobSkillSchema>;

export const jobPostingSchema = z.object({
  title: required(150),
  description: required(5000),
  workMode: z.enum(workModes, { error: "Escolha a modalidade de trabalho." }),
  closingDate: z
    .string()
    .min(1, { error: "Informe a data de encerramento.", abort: true })
    .refine(
      (value) => value >= todayIsoDate(),
      "A data de encerramento não pode estar no passado.",
    ),
  skills: z
    .array(jobSkillSchema)
    .min(1, "Adicione pelo menos uma habilidade.")
    .max(MAX_SKILLS, `Use até ${MAX_SKILLS} habilidades.`),
});

export type JobPostingValues = z.infer<typeof jobPostingSchema>;

/**
 * Editing changes the title, the description and the skills. The description
 * follows `PATCH /jobs/{id}`: it may be empty and holds up to 10,000
 * characters, so every job the API stored can be saved again. The work mode and
 * the closing date stay as stored: the form carries them without showing or
 * checking them, so a job past its date can still be edited.
 */
export const jobEditSchema = jobPostingSchema.extend({
  description: z.string().trim().max(10000, "Use até 10000 caracteres."),
  workMode: workModeSchema,
  closingDate: z.string(),
});

const saoPauloCalendar = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Today's date in São Paulo, as `<input type="date">` reads it. The API decides
 * whether a job is open, and whether a new closing date is in the past, by this
 * calendar (`app.core.local_date`), so "Minhas vagas" matches what candidates
 * find wherever the person is.
 */
export function todayIsoDate(now: Date = new Date()): string {
  const parts = Object.fromEntries(
    saoPauloCalendar.formatToParts(now).map(({ type, value }) => [type, value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/**
 * The form in which the catalog compares two skill names: no case, accents,
 * invisible characters or repeated spaces. "Gestão  de equipes" and
 * "gestao de equipes" are the same skill.
 */
export function normalizeSkillName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\p{Mn}\p{Sk}\p{Cf}]/gu, "")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}
