import { z } from "zod";

import { apiClient } from "@/lib/api-client";

// Mesmo limite do back (CreateContactRequest: 1 a 2000 caracteres após trim).
export const MAX_MESSAGE_LENGTH = 2000;

const contactResponseSchema = z.object({
  id: z.string(),
  job_id: z.string(),
  candidate_id: z.string(),
  created_at: z.string(),
  // O e-mail sai depois do commit (começa como "pending"); a tela não depende disso.
  email_status: z.string(),
});

export type ContactResponse = z.infer<typeof contactResponseSchema>;

export interface ContactProfessionalInput {
  jobId: string;
  candidateId: string;
  message: string;
}

export async function contactProfessional(
  input: ContactProfessionalInput,
): Promise<ContactResponse> {
  const { data } = await apiClient.post<unknown>("/contacts", {
    job_id: input.jobId,
    candidate_id: input.candidateId,
    message: input.message.trim(),
  });

  return contactResponseSchema.parse(data);
}

// O apiClient sempre rejeita com ApiError, que traz o `.status` HTTP plano.
const errorShapeSchema = z.object({ status: z.number().optional() });

/** Traduz a falha do POST /contacts em uma mensagem que a empresa entenda. */
export function contactErrorMessage(error: unknown): string {
  const parsed = errorShapeSchema.safeParse(error);
  const status = parsed.success ? parsed.data.status : undefined;

  switch (status) {
    case 403:
      return "Sua conta de empresa não pode enviar contatos no momento.";
    case 404:
      return "Este profissional não aparece mais na lista desta vaga.";
    case 409:
      return "Este profissional não pode receber contatos no momento.";
    case 422:
      return `Confira a mensagem: ela precisa ter entre 1 e ${MAX_MESSAGE_LENGTH} caracteres.`;
    default:
      return "Não foi possível enviar a mensagem. Tente novamente.";
  }
}
