import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { z } from "zod";

import { apiClient } from "@/lib/api-client";
import { ApiError } from "@/lib/api-error";
import { type SkillType, skillTypes } from "@/lib/skill-type";

const SKILLS_ENDPOINT = "/admin/skills";

export const SKILLS_PAGE_SIZE = 20;
// Mirrors the backend catalog, which caps a name at 100 characters.
export const SKILL_NAME_MAX_LENGTH = 100;

const skillStatusSchema = z.enum(["active", "inactive"]);

const catalogSkillSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  type: z.enum(skillTypes),
  status: skillStatusSchema,
});

const catalogSkillListSchema = z.object({
  items: z.array(catalogSkillSchema),
  total: z.number().int().nonnegative(),
});

export type SkillStatus = z.infer<typeof skillStatusSchema>;
export type CatalogSkill = z.infer<typeof catalogSkillSchema>;
export type CatalogSkillList = z.infer<typeof catalogSkillListSchema>;

export interface SkillFilters {
  search: string;
  type: "all" | SkillType;
  status: "all" | SkillStatus;
  offset: number;
}

export const defaultSkillFilters: SkillFilters = {
  search: "",
  type: "all",
  status: "all",
  offset: 0,
};

export const skillStatusLabels: Record<SkillStatus, string> = {
  active: "Ativa",
  inactive: "Inativa",
};

export function skillsSearchParams(filters: SkillFilters): string {
  const params = new URLSearchParams();
  const search = filters.search.trim();
  if (search !== "") params.set("search", search);
  if (filters.type !== "all") params.set("type", filters.type);
  if (filters.status !== "all") params.set("status", filters.status);
  params.set("limit", String(SKILLS_PAGE_SIZE));
  params.set("offset", String(filters.offset));
  return params.toString();
}

function parseSkill(data: unknown): CatalogSkill {
  const parsed = catalogSkillSchema.safeParse(data);
  if (!parsed.success) {
    throw new ApiError({
      message: "Unexpected catalog skill response",
      code: "invalid_catalog_skill_response",
    });
  }
  return parsed.data;
}

export async function fetchCatalogSkills(
  filters: SkillFilters,
  signal?: AbortSignal,
): Promise<CatalogSkillList> {
  const response = await apiClient.get<unknown>(
    `${SKILLS_ENDPOINT}?${skillsSearchParams(filters)}`,
    signal ? { signal } : undefined,
  );
  const parsed = catalogSkillListSchema.safeParse(response.data);
  if (!parsed.success) {
    throw new ApiError({
      message: "Unexpected catalog skill list response",
      code: "invalid_catalog_skill_list_response",
    });
  }
  return parsed.data;
}

export const catalogSkillsQueryKey = ["administrator", "skills"] as const;

export function catalogSkillsQueryOptions(filters: SkillFilters) {
  return queryOptions({
    queryKey: [...catalogSkillsQueryKey, filters],
    queryFn: ({ signal }) => fetchCatalogSkills(filters, signal),
    retry: false,
    // The table stays on screen while the next search loads.
    placeholderData: keepPreviousData,
  });
}

export const skillValuesSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: "Informe o nome da competência." })
    .max(SKILL_NAME_MAX_LENGTH, {
      message: `Use até ${SKILL_NAME_MAX_LENGTH} caracteres.`,
    }),
  type: z.enum(skillTypes, { error: "Escolha o tipo da competência." }),
});

export type SkillValues = z.infer<typeof skillValuesSchema>;

export async function createCatalogSkill(
  values: SkillValues,
): Promise<CatalogSkill> {
  const response = await apiClient.post<unknown>(SKILLS_ENDPOINT, values);
  return parseSkill(response.data);
}

export async function updateCatalogSkill(
  skillId: string,
  values: SkillValues,
): Promise<CatalogSkill> {
  const response = await apiClient.patch<unknown>(
    `${SKILLS_ENDPOINT}/${skillId}`,
    values,
  );
  return parseSkill(response.data);
}

export async function changeCatalogSkillStatus(
  skillId: string,
  status: SkillStatus,
): Promise<CatalogSkill> {
  const response = await apiClient.patch<unknown>(
    `${SKILLS_ENDPOINT}/${skillId}`,
    { status },
  );
  return parseSkill(response.data);
}

export function isSkillNameConflict(error: unknown): boolean {
  return error instanceof ApiError && error.code === "skill_name_conflict";
}

export function catalogSkillsErrorMessage(error: unknown): string {
  if (
    error instanceof ApiError &&
    (error.code === "administrator_required" || error.status === 403)
  ) {
    return "Apenas administradores podem consultar o catálogo de competências.";
  }
  return "Não foi possível carregar as competências. Tente novamente.";
}

export function skillSaveErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "skill_name_conflict") {
      return "Já existe uma competência com esse nome no catálogo. Se ela estiver inativa, reative-a na lista.";
    }
    if (error.code === "skill_not_found") {
      return "Esta competência não está mais disponível. Atualize a lista.";
    }
    if (error.code === "administrator_required" || error.status === 403) {
      return "Apenas administradores podem alterar o catálogo de competências.";
    }
    if (error.code === "validation_error") {
      return `Revise o nome: use de 1 a ${SKILL_NAME_MAX_LENGTH} caracteres visíveis.`;
    }
  }
  return "Não foi possível salvar a competência. Os dados foram mantidos; tente novamente.";
}

export function skillStatusErrorMessage(
  error: unknown,
  status: SkillStatus,
): string {
  if (error instanceof ApiError) {
    if (error.code === "skill_not_found") {
      return "Esta competência não está mais disponível. Atualize a lista.";
    }
    if (error.code === "administrator_required" || error.status === 403) {
      return "Apenas administradores podem alterar o catálogo de competências.";
    }
  }
  return status === "inactive"
    ? "Não foi possível inativar a competência. Tente novamente."
    : "Não foi possível reativar a competência. Tente novamente.";
}
