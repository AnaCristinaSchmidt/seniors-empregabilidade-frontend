import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { z } from "zod";

import { apiClient } from "@/lib/api-client";
import { ApiError } from "@/lib/api-error";

import {
  certificationSchema,
  experienceSchema,
  educationSchema,
  professionalProfileSchema,
  skillSchema,
  type Certification,
  type Education,
  type Experience,
  type ProfessionalProfile,
  type Skill,
} from "./professional-profile-schema";

const PROFILE_ENDPOINT = "/professionals/me";

export const professionalProfileQueryKey = [
  "candidates",
  "professional-profile",
] as const;

export async function fetchProfessionalProfile(
  signal?: AbortSignal,
): Promise<ProfessionalProfile> {
  const response = await apiClient.get<unknown>(
    PROFILE_ENDPOINT,
    signal ? { signal } : {},
  );

  const parsed = professionalProfileSchema.safeParse(response.data);

  if (!parsed.success) {
    throw new ApiError({
      message: "Não foi possível carregar os dados do seu perfil.",
      code: "invalid_profile_response",
    });
  }

  return parsed.data;
}

export const professionalProfileQueryOptions = queryOptions({
  queryKey: professionalProfileQueryKey,
  queryFn: ({ signal }) => fetchProfessionalProfile(signal),
  // Uma falha aqui normalmente é um problema real de contrato ou de rede;
  // retry especulativo só atrasa o feedback pro usuário (ver AGENTS.md).
  retry: false,
});

// ---------- Experiência ----------
// Espelha ExperienceCreateRequest/ExperienceUpdateRequest do backend
// (app/candidates/schemas/experience.py). O modal sempre reenvia o item
// inteiro ao concluir a edição, então create e update usam o mesmo
// shape — desde que company_name/role/start_date nunca sejam mandados
// como null explícito (o backend rejeita isso).

const experienceText = z
  .string()
  .trim()
  .min(1, "Campo obrigatório.")
  .max(150, "Máximo de 150 caracteres.");

const experienceDescriptionText = z
  .string()
  .trim()
  .max(2000, "Máximo de 2000 caracteres.");

export const experienceValuesSchema = z.object({
  company_name: experienceText,
  role: experienceText,
  start_date: z.string().min(1, "Informe a data de início."),
  end_date: z.string().nullable(),
  description: experienceDescriptionText.nullable(),
});

export type ExperienceValues = z.infer<typeof experienceValuesSchema>;

export async function createExperience(
  values: ExperienceValues,
): Promise<Experience> {
  const response = await apiClient.post<unknown>(
    `${PROFILE_ENDPOINT}/experiences`,
    values,
  );
  const parsed = experienceSchema.safeParse(response.data);
  if (!parsed.success) {
    throw new ApiError({
      message: "Não foi possível validar a experiência criada.",
      code: "invalid_experience_response",
    });
  }
  return parsed.data;
}

export async function updateExperienceById(
  id: string,
  values: ExperienceValues,
): Promise<Experience> {
  const response = await apiClient.patch<unknown>(
    `${PROFILE_ENDPOINT}/experiences/${id}`,
    values,
  );
  const parsed = experienceSchema.safeParse(response.data);
  if (!parsed.success) {
    throw new ApiError({
      message: "Não foi possível validar a experiência atualizada.",
      code: "invalid_experience_response",
    });
  }
  return parsed.data;
}

export async function deleteExperienceById(id: string): Promise<void> {
  await apiClient.delete(`${PROFILE_ENDPOINT}/experiences/${id}`);
}

// ---------- Formação ----------
// Espelha EducationCreateRequest/EducationUpdateRequest do backend
// (app/candidates/schemas/education.py). Só `institution` é obrigatório
// e não pode ser mandado como null explícito.

const institutionName = z
  .string()
  .trim()
  .min(1, "Campo obrigatório.")
  .max(150, "Máximo de 150 caracteres.");

const educationDetail = z
  .string()
  .trim()
  .min(1, "Campo obrigatório.")
  .max(100, "Máximo de 100 caracteres.");

export const educationValuesSchema = z.object({
  institution: institutionName,
  degree: educationDetail.nullable(),
  field: educationDetail.nullable(),
  start_date: z.string().nullable(),
  end_date: z.string().nullable(),
});

export type EducationValues = z.infer<typeof educationValuesSchema>;

export async function createEducation(
  values: EducationValues,
): Promise<Education> {
  const response = await apiClient.post<unknown>(
    `${PROFILE_ENDPOINT}/education`,
    values,
  );
  const parsed = educationSchema.safeParse(response.data);
  if (!parsed.success) {
    throw new ApiError({
      message: "Não foi possível validar a formação criada.",
      code: "invalid_education_response",
    });
  }
  return parsed.data;
}

export async function updateEducationById(
  id: string,
  values: EducationValues,
): Promise<Education> {
  const response = await apiClient.patch<unknown>(
    `${PROFILE_ENDPOINT}/education/${id}`,
    values,
  );
  const parsed = educationSchema.safeParse(response.data);
  if (!parsed.success) {
    throw new ApiError({
      message: "Não foi possível validar a formação atualizada.",
      code: "invalid_education_response",
    });
  }
  return parsed.data;
}

export async function deleteEducationById(id: string): Promise<void> {
  await apiClient.delete(`${PROFILE_ENDPOINT}/education/${id}`);
}

// ---------- Certificações ----------
// Mirrors app/candidates/schemas/certification.py; the server decides the file type by content.

const certificationText = z
  .string()
  .trim()
  .min(1, "Campo obrigatório.")
  .max(150, "Máximo de 150 caracteres.");

export const certificationValuesSchema = z
  .object({
    name: certificationText,
    issuer: certificationText.nullable(),
    issued_date: z.string().nullable(),
    expiration_date: z.string().nullable(),
  })
  .refine(
    (values) =>
      !values.issued_date ||
      !values.expiration_date ||
      values.expiration_date >= values.issued_date,
    { message: "A validade não pode ser anterior à data de emissão." },
  );

export type CertificationValues = z.infer<typeof certificationValuesSchema>;

export const MAX_CERTIFICATE_BYTES = 5 * 1024 * 1024;
export const CERTIFICATE_ACCEPT =
  ".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg";
const CERTIFICATE_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
]);
const CERTIFICATE_EXTENSION = /\.(pdf|png|jpe?g)$/i;

/** Returns why the file cannot be sent, or null when it may be uploaded. */
export function certificateFileProblem(file: File): string | null {
  if (
    !CERTIFICATE_TYPES.has(file.type) &&
    !CERTIFICATE_EXTENSION.test(file.name)
  ) {
    return "Envie um arquivo PDF, PNG ou JPG.";
  }
  if (file.size > MAX_CERTIFICATE_BYTES) {
    return "O arquivo pode ter no máximo 5 MB.";
  }
  return null;
}

function parseCertification(data: unknown): Certification {
  const parsed = certificationSchema.safeParse(data);
  if (!parsed.success) {
    throw new ApiError({
      message: "Não foi possível validar a certificação.",
      code: "invalid_certification_response",
    });
  }
  return parsed.data;
}

export async function createCertification(
  values: CertificationValues,
): Promise<Certification> {
  const response = await apiClient.post<unknown>(
    `${PROFILE_ENDPOINT}/certifications`,
    values,
  );
  return parseCertification(response.data);
}

export async function updateCertificationById(
  id: string,
  values: CertificationValues,
): Promise<Certification> {
  const response = await apiClient.patch<unknown>(
    `${PROFILE_ENDPOINT}/certifications/${id}`,
    values,
  );
  return parseCertification(response.data);
}

export async function deleteCertificationById(id: string): Promise<void> {
  await apiClient.delete(`${PROFILE_ENDPOINT}/certifications/${id}`);
}

export async function uploadCertificationDocument(
  id: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<Certification> {
  const body = new FormData();
  body.append("file", file);
  const response = await apiClient.put<unknown>(
    `${PROFILE_ENDPOINT}/certifications/${id}/document`,
    body,
    {
      // A slow connection may need more than the default 15 s for 5 MB.
      timeout: 120_000,
      onUploadProgress: (event) => {
        if (onProgress && event.total) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      },
    },
  );
  return parseCertification(response.data);
}

export async function deleteCertificationDocument(id: string): Promise<void> {
  await apiClient.delete(`${PROFILE_ENDPOINT}/certifications/${id}/document`);
}

const documentLinkSchema = z.object({
  url: z.string().url(),
  expires_at: z.string(),
});

/** A pre-signed link that downloads the document; it expires in minutes. */
export async function fetchCertificationDocumentUrl(
  id: string,
): Promise<string> {
  const response = await apiClient.get<unknown>(
    `${PROFILE_ENDPOINT}/certifications/${id}/document`,
  );
  const parsed = documentLinkSchema.safeParse(response.data);
  if (!parsed.success) {
    throw new ApiError({
      message: "Não foi possível abrir o comprovante.",
      code: "invalid_document_link_response",
    });
  }
  return parsed.data.url;
}

// ---------- Habilidades ----------
// The profile links skills from the shared catalog (GET /skills) by id; a
// candidate cannot create a new catalog entry, only pick an existing one.

const SKILL_CATALOG_ENDPOINT = "/skills";
export const SKILL_CATALOG_LIMIT = 20;

export async function searchSkillCatalog(
  search: string,
  signal?: AbortSignal,
): Promise<Skill[]> {
  const response = await apiClient.get<unknown>(SKILL_CATALOG_ENDPOINT, {
    params: { search, limit: SKILL_CATALOG_LIMIT },
    ...(signal ? { signal } : {}),
  });
  const parsed = z.array(skillSchema).safeParse(response.data);
  if (!parsed.success) {
    throw new ApiError({
      message: "Não foi possível carregar as sugestões de habilidades.",
      code: "invalid_skill_catalog_response",
    });
  }
  return parsed.data;
}

/** A blank search lists the catalog in alphabetical order. */
export function skillCatalogQueryOptions(search: string) {
  return queryOptions({
    queryKey: ["skills", "catalog", search] as const,
    queryFn: ({ signal }) => searchSkillCatalog(search, signal),
    // The previous list stays on screen while the next search loads.
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    retry: false,
  });
}

export async function addProfileSkill(skillId: string): Promise<Skill> {
  const response = await apiClient.post<unknown>(`${PROFILE_ENDPOINT}/skills`, {
    skill_id: skillId,
  });
  const parsed = skillSchema.safeParse(response.data);
  if (!parsed.success) {
    throw new ApiError({
      message: "Não foi possível validar a habilidade adicionada.",
      code: "invalid_skill_response",
    });
  }
  return parsed.data;
}

export async function removeProfileSkill(skillId: string): Promise<void> {
  await apiClient.delete(`${PROFILE_ENDPOINT}/skills/${skillId}`);
}

/** Compare catalog IDs; display order does not change the saved selection. */
export function sameSkillSelection(
  left: readonly Skill[],
  right: readonly Skill[],
): boolean {
  const ids = new Set(left.map((skill) => skill.id));
  return ids.size === right.length && right.every((skill) => ids.has(skill.id));
}

export const MAX_SELECTED_SKILLS = 100;

/** Replace the whole skill set in one backend transaction. */
export async function saveSkillSelection(
  selected: readonly Skill[],
): Promise<Skill[]> {
  const response = await apiClient.put<unknown>(`${PROFILE_ENDPOINT}/skills`, {
    skill_ids: selected.map((skill) => skill.id),
  });
  const parsed = z.array(skillSchema).safeParse(response.data);
  if (!parsed.success) {
    throw new ApiError({
      message: "Não foi possível validar as habilidades salvas.",
      code: "invalid_skill_response",
    });
  }
  return parsed.data;
}
