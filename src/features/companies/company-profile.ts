import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";

import { apiClient } from "@/lib/api-client";
import { ApiError } from "@/lib/api-error";

// Mirrors CompanyProfileResponse in the backend
// (app/companies/schemas/company_profile_response.py, US-30-T01).
const companyAddressSchema = z.object({
  street: z.string(),
  number: z.string(),
  complement: z.string().nullable(),
  neighborhood: z.string(),
  city: z.string(),
  state: z.string(),
  zip_code: z.string(),
});

const companyProfileSchema = z.object({
  id: z.uuid(),
  cnpj: z.string(),
  display_name: z.string().nullable(),
  legal_name: z.string(),
  industry: z.string().nullable(),
  address: companyAddressSchema.nullable(),
  contact_email: z.string(),
  contact_phone: z.string().nullable(),
});

export type CompanyAddress = z.infer<typeof companyAddressSchema>;
export type CompanyProfile = z.infer<typeof companyProfileSchema>;

export const companyProfileQueryKey = ["companies", "profile"] as const;

export async function fetchCompanyProfile(
  signal?: AbortSignal,
): Promise<CompanyProfile> {
  const response = await apiClient.get<unknown>(
    "/companies/me/profile",
    signal ? { signal } : {},
  );
  const parsed = companyProfileSchema.safeParse(response.data);
  if (!parsed.success) {
    throw new ApiError({
      message: "Não foi possível validar o perfil da empresa.",
      code: "invalid_company_profile_response",
    });
  }
  return parsed.data;
}

/** Mirrors CompanyProfileUpdateRequest: the whole editable profile at once. */
export interface CompanyProfileUpdate {
  display_name: string;
  legal_name: string;
  industry: string | null;
  address: {
    street: string;
    number: string;
    complement: string | null;
    neighborhood: string;
    city: string;
    state: string;
    zip_code: string;
  };
  contact_email: string;
  contact_phone: string | null;
}

export async function updateCompanyProfile(
  update: CompanyProfileUpdate,
): Promise<CompanyProfile> {
  const response = await apiClient.put<unknown>(
    "/companies/me/profile",
    update,
  );
  const parsed = companyProfileSchema.safeParse(response.data);
  if (!parsed.success) {
    throw new ApiError({
      message: "Não foi possível validar o perfil salvo.",
      code: "invalid_company_profile_response",
    });
  }
  return parsed.data;
}

export const companyProfileQueryOptions = queryOptions({
  queryKey: companyProfileQueryKey,
  queryFn: ({ signal }) => fetchCompanyProfile(signal),
  // A failure here is a contract or network problem; a speculative retry only
  // delays the message (see AGENTS.md).
  retry: false,
});

const GENERIC_LOAD_ERROR =
  "Não foi possível carregar o perfil da empresa. Tente novamente.";

const loadMessages: Record<string, string> = {
  approved_company_required:
    "Sua empresa ainda não foi aprovada. Assim que a aprovação sair, o perfil aparece aqui.",
  invalid_access_token:
    "Sua sessão expirou. Entre novamente para ver o perfil.",
};

function mappedMessage(error: unknown): string | undefined {
  if (
    error instanceof ApiError &&
    error.code !== undefined &&
    Object.hasOwn(loadMessages, error.code)
  ) {
    return loadMessages[error.code];
  }
  return undefined;
}

/**
 * The API's `detail` is English operator text, so the message is chosen by
 * `code`. Anything unmapped, including network failures, stays generic.
 */
export function companyProfileErrorMessage(error: unknown): string {
  return mappedMessage(error) ?? GENERIC_LOAD_ERROR;
}

/** Trying again cannot help until the company is approved or signs in again. */
export function canRetryCompanyProfile(error: unknown): boolean {
  return mappedMessage(error) === undefined;
}
