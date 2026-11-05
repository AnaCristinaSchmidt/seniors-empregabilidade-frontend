import { z } from "zod";

export function digits(value: string): string {
  return value.replace(/\D/g, "");
}

export function isValidCnpj(value: string): boolean {
  const normalized = digits(value);
  if (!/^\d{14}$/.test(normalized) || /^(\d)\1{13}$/.test(normalized))
    return false;
  const calculate = (base: string) => {
    let weight = base.length - 7;
    let sum = 0;
    for (const digit of base) {
      sum += Number(digit) * weight;
      weight = weight === 2 ? 9 : weight - 1;
    }
    return sum % 11 < 2 ? 0 : 11 - (sum % 11);
  };
  return (
    calculate(normalized.slice(0, 12)) === Number(normalized[12]) &&
    calculate(normalized.slice(0, 13)) === Number(normalized[13])
  );
}

export function maskCnpj(value: string): string {
  return digits(value)
    .slice(0, 14)
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2}\.\d{3})(\d)/, "$1.$2")
    .replace(/(\.\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

export function maskZipCode(value: string): string {
  return digits(value)
    .slice(0, 8)
    .replace(/^(\d{5})(\d)/, "$1-$2");
}

export function maskedCaret(masked: string, digitsBeforeCaret: number): number {
  if (digitsBeforeCaret <= 0) return 0;
  let seen = 0;
  for (let index = 0; index < masked.length; index += 1) {
    if (/\d/.test(masked.charAt(index))) {
      seen += 1;
      if (seen === digitsBeforeCaret) return index + 1;
    }
  }
  return masked.length;
}

export const required = (max: number) =>
  z
    .string()
    .trim()
    .min(1, "Preencha este campo.")
    .max(max, `Use até ${max} caracteres.`);

/** Mirrors AddressRequest in the backend, shared by registration and profile. */
export const companyAddressSchema = z.object({
  zip_code: z
    .string()
    .refine(
      (value) => /^\d{8}$/.test(digits(value)),
      "Informe um CEP com 8 números.",
    ),
  street: required(150),
  number: required(10),
  complement: z.string().trim().max(100, "Use até 100 caracteres."),
  neighborhood: required(100),
  city: required(100),
  state: z
    .string()
    .trim()
    .toUpperCase()
    .regex(
      /^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/,
      "Informe a sigla do estado, como RS.",
    ),
});
export type CompanyAddressValues = z.infer<typeof companyAddressSchema>;
export const companyRegistrationSchema = z
  .object({
    cnpj: z.string().refine(isValidCnpj, "Informe um CNPJ válido."),
    display_name: required(200),
    corporate_email: z.email("Informe um e-mail válido.").max(150),
    linkedin_url: z
      .string()
      .max(2048)
      .refine((value) => {
        if (!value) return true;
        try {
          const url = new URL(value);
          return (
            url.protocol === "https:" &&
            ["linkedin.com", "www.linkedin.com"].includes(url.hostname) &&
            !url.username &&
            !url.password &&
            (!url.port || url.port === "443") &&
            /^\/company\/[^/]+/.test(url.pathname)
          );
        } catch {
          return false;
        }
      }, "Informe o endereço HTTPS da empresa no LinkedIn."),
    address: companyAddressSchema,
    password: z
      .string()
      .min(8, "Use pelo menos 8 caracteres.")
      .max(128)
      .regex(/[a-z]/, "Inclua uma letra minúscula.")
      .regex(/[A-Z]/, "Inclua uma letra maiúscula.")
      .regex(/[0-9]/, "Inclua um número.")
      .regex(/[^a-zA-Z0-9\s]/, "Inclua um símbolo."),
    confirm_password: z.string(),
    terms_accepted: z
      .boolean()
      .refine(Boolean, "Aceite os termos para continuar."),
  })
  .refine((value) => value.password === value.confirm_password, {
    path: ["confirm_password"],
    message: "As senhas não coincidem.",
  });
export type CompanyRegistrationValues = z.infer<
  typeof companyRegistrationSchema
>;
