import type { FieldPath } from "react-hook-form";
import { z } from "zod";

import { ApiError } from "@/lib/api-error";

import type { CompanyProfile, CompanyProfileUpdate } from "./company-profile";
import {
  companyAddressSchema,
  digits,
  maskZipCode,
  required,
} from "./registration-schema";

// Same rules as CompanyProfileUpdateRequest in the backend, so a refusal
// there is the exception rather than the way to learn about a field.
export const companyProfileFormSchema = z.object({
  display_name: required(200),
  legal_name: required(200),
  industry: z.string().trim().max(100, "Use até 100 caracteres."),
  contact_email: z
    .email("Falta o @ e o domínio. Exemplo: contato@suaempresa.com.br")
    .max(150, "Use até 150 caracteres."),
  contact_phone: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || /^\+?[0-9 ()-]{7,20}$/.test(value),
      "Use de 7 a 20 caracteres entre números, espaços, parênteses, hífen e +. Exemplo: (51) 3333-0000",
    ),
  address: companyAddressSchema,
});

export type CompanyProfileFormValues = z.infer<typeof companyProfileFormSchema>;
type FormField = FieldPath<CompanyProfileFormValues>;

/** The form opens with what the profile has now. */
export function toFormValues(
  profile: CompanyProfile,
): CompanyProfileFormValues {
  const address = profile.address;
  return {
    display_name: profile.display_name ?? "",
    legal_name: profile.legal_name,
    industry: profile.industry ?? "",
    contact_email: profile.contact_email,
    contact_phone: profile.contact_phone ?? "",
    address: {
      zip_code: address ? maskZipCode(address.zip_code) : "",
      street: address?.street ?? "",
      number: address?.number ?? "",
      complement: address?.complement ?? "",
      neighborhood: address?.neighborhood ?? "",
      city: address?.city ?? "",
      state: address?.state ?? "",
    },
  };
}

/** Blank optional fields are sent as null, which the API stores as cleared. */
export function toUpdateRequest(
  values: CompanyProfileFormValues,
): CompanyProfileUpdate {
  return {
    display_name: values.display_name,
    legal_name: values.legal_name,
    industry: values.industry || null,
    contact_email: values.contact_email.trim().toLowerCase(),
    contact_phone: values.contact_phone || null,
    address: {
      ...values.address,
      zip_code: digits(values.address.zip_code),
      complement: values.address.complement || null,
    },
  };
}

export interface CompanyProfileSaveFailure {
  message: string;
  fields: { field: FormField; message: string }[];
}

const formFields: FormField[] = [
  "display_name",
  "legal_name",
  "industry",
  "contact_email",
  "contact_phone",
  "address.zip_code",
  "address.street",
  "address.number",
  "address.complement",
  "address.neighborhood",
  "address.city",
  "address.state",
];

const GENERIC_SAVE_ERROR =
  "Não foi possível salvar as alterações. Seus dados foram mantidos; tente novamente.";
const FIELDS_HIGHLIGHTED = "Confira os campos destacados e tente novamente.";
const BLOCKED_EMAIL =
  "Use um e-mail corporativo, como contato@suaempresa.com.br.";

const saveMessages: Record<string, string> = {
  company_email_domain_blocked: BLOCKED_EMAIL,
  approved_company_required:
    "Sua empresa ainda não foi aprovada. Assim que a aprovação sair, você poderá editar o perfil.",
  invalid_access_token:
    "Sua sessão expirou. Entre novamente para salvar o perfil.",
  invalid_company_profile_response:
    "Não conseguimos confirmar o salvamento. Feche esta janela e confira o perfil antes de tentar de novo.",
};

/**
 * The API's `detail` is English operator text, so the message is chosen by
 * `code`, and each field the API names gets its own message on the form.
 */
export function companyProfileSaveFailure(
  error: unknown,
): CompanyProfileSaveFailure {
  if (!(error instanceof ApiError) || error.code === undefined) {
    return { message: GENERIC_SAVE_ERROR, fields: [] };
  }

  const fieldMessage =
    error.code === "company_email_domain_blocked"
      ? BLOCKED_EMAIL
      : "Confira o valor deste campo.";
  const fields = Object.keys(error.errors ?? {})
    .map((location) => location.replace(/^body\./, ""))
    .filter((location): location is FormField =>
      formFields.includes(location as FormField),
    )
    .map((field) => ({ field, message: fieldMessage }));

  // The field says what is wrong; the summary only points at it, so the same
  // sentence is not read twice.
  if (fields.length > 0) return { message: FIELDS_HIGHLIGHTED, fields };

  const message = Object.hasOwn(saveMessages, error.code)
    ? saveMessages[error.code]
    : undefined;
  return { message: message ?? GENERIC_SAVE_ERROR, fields };
}
