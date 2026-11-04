import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api-error";

import { applyToJobVacancyErrorMessage } from "./job-vacancy-errors";

describe("applyToJobVacancyErrorMessage", () => {
  it("translates a known apply error code", () => {
    expect(
      applyToJobVacancyErrorMessage(
        new ApiError({
          message: "Application already exists",
          code: "application_already_exists",
        }),
      ),
    ).toBe("Você já se candidatou a esta vaga.");
  });

  it("translates a closed vacancy and a missing vacancy", () => {
    expect(
      applyToJobVacancyErrorMessage(
        new ApiError({ message: "closed", code: "job_not_open" }),
      ),
    ).toBe("Esta vaga está encerrada.");
    expect(
      applyToJobVacancyErrorMessage(
        new ApiError({ message: "missing", code: "job_not_found" }),
      ),
    ).toBe("Não encontramos esta vaga.");
  });

  it("keeps a malformed apply response generic", () => {
    expect(
      applyToJobVacancyErrorMessage(
        new ApiError({
          message: "English operator text",
          code: "invalid_job_application_response",
        }),
      ),
    ).toBe("Não foi possível enviar a candidatura. Tente novamente.");
  });

  it("falls back for a network error", () => {
    expect(applyToJobVacancyErrorMessage(new Error("Network Error"))).toBe(
      "Não foi possível enviar a candidatura. Tente novamente.",
    );
  });

  it("falls back to a generic message for an unknown code", () => {
    expect(
      applyToJobVacancyErrorMessage(
        new ApiError({
          message: "Some technical detail from the backend.",
          code: "some_unmapped_code",
        }),
      ),
    ).toBe("Não foi possível enviar a candidatura. Tente novamente.");
  });
});
