import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api-error";

import {
  profileErrorMessage,
  profileSaveErrorMessage,
} from "./professional-profile-errors";

describe("profileErrorMessage", () => {
  it("translates a known error code", () => {
    const error = new ApiError({
      message: "The professional profile was not found.",
      code: "profile_not_found",
    });

    expect(profileErrorMessage(error)).toBe(
      "Não encontramos seu perfil de candidato.",
    );
  });

  it("falls back to a generic message for an unknown code", () => {
    const error = new ApiError({
      message: "Some technical detail from the backend.",
      code: "some_unmapped_code",
    });

    expect(profileErrorMessage(error)).toBe(
      "Não foi possível carregar seu perfil. Tente novamente.",
    );
  });

  it("falls back to a generic message for a plain network error", () => {
    expect(profileErrorMessage(new Error("Network Error"))).toBe(
      "Não foi possível carregar seu perfil. Tente novamente.",
    );
  });
});

describe("profileSaveErrorMessage", () => {
  it("translates a save-specific error code", () => {
    const error = new ApiError({
      message: "The skill was not found.",
      code: "skill_not_found",
    });

    expect(profileSaveErrorMessage(error)).toBe(
      "Uma das habilidades escolhidas não está mais disponível. Revise a seleção no catálogo e tente salvar novamente.",
    );
  });

  it("still translates the codes shared with loading", () => {
    const error = new ApiError({
      message: "The professional profile was not found.",
      code: "profile_not_found",
    });

    expect(profileSaveErrorMessage(error)).toBe(
      "Não encontramos seu perfil de candidato.",
    );
  });

  it("falls back to a generic save message", () => {
    expect(profileSaveErrorMessage(new Error("Network Error"))).toBe(
      "Não foi possível salvar a alteração. Tente novamente.",
    );
  });
});
