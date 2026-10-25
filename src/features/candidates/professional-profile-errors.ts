import { ApiError } from "@/lib/api-error";

const GENERIC_PROFILE_ERROR =
  "Não foi possível carregar seu perfil. Tente novamente.";

const GENERIC_SAVE_ERROR =
  "Não foi possível salvar a alteração. Tente novamente.";

const messages: Record<string, string> = {
  profile_not_found: "Não encontramos seu perfil de candidato.",
};

const saveMessages: Record<string, string> = {
  ...messages,
  validation_error:
    "Alguns dados não foram aceitos. Revise os campos e tente novamente.",
  invalid_experience_period:
    "A data de fim não pode ser anterior à data de início.",
  invalid_education_period:
    "A data de conclusão não pode ser anterior à data de início.",
  experience_not_found:
    "Esta experiência não existe mais. Feche e abra o perfil novamente.",
  education_not_found:
    "Esta formação não existe mais. Feche e abra o perfil novamente.",
  invalid_certification_period:
    "A validade não pode ser anterior à data de emissão.",
  certification_not_found:
    "Esta certificação não existe mais. Feche e abra o perfil novamente.",
  certification_document_not_found: "Esta certificação não tem comprovante.",
  unsupported_document_type: "Envie um arquivo PDF, PNG ou JPG.",
  document_too_large: "O arquivo pode ter no máximo 5 MB.",
  document_storage_unavailable:
    "O envio de arquivos está indisponível agora. Tente novamente mais tarde.",
  skill_not_found:
    "Uma das habilidades escolhidas não está mais disponível. Revise a seleção no catálogo e tente salvar novamente.",
  skill_already_added: "Esta habilidade já está no seu perfil.",
};

function translate(
  error: unknown,
  table: Record<string, string>,
  fallback: string,
): string {
  if (error instanceof ApiError && error.code) {
    return table[error.code] ?? fallback;
  }

  return fallback;
}

/**
 * The API's `detail` is English operator text (problem+json), so it is
 * mapped by `code` to the Brazilian Portuguese the user reads. An unmapped
 * failure — including network errors and our own schema-mismatch error —
 * stays generic rather than leaking a provider message.
 */
export function profileErrorMessage(error: unknown): string {
  return translate(error, messages, GENERIC_PROFILE_ERROR);
}

/** Same mapping as `profileErrorMessage`, for failures while saving. */
export function profileSaveErrorMessage(error: unknown): string {
  return translate(error, saveMessages, GENERIC_SAVE_ERROR);
}
