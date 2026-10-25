import { afterEach, describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api-error";

import { stubApiRoutes, type ApiStub } from "../../../tests/api-stub";

import {
  accountFiltersError,
  accountStatusValuesSchema,
  accountsErrorMessage,
  accountsSearchParams,
  changeAccountStatus,
  defaultAccountFilters,
  fetchAccountDetail,
  fetchAccounts,
  statusChangeErrorMessage,
} from "./accounts-api";

const candidate = {
  id: "60000000-0000-4000-8000-000000000001",
  user_type: "candidate",
  email: "candidate@example.invalid",
  display_name: "Pessoa Sintética",
  account_status: "active",
  company_status: null,
  completion_percentage: 70,
  created_at: "2026-10-20T15:00:00Z",
};

let stub: ApiStub | undefined;

afterEach(() => {
  stub?.restore();
  stub = undefined;
});

describe("account filters", () => {
  it("combines the selected filters into the query string", () => {
    expect(
      accountsSearchParams({
        ...defaultAccountFilters,
        userType: "candidate",
        accountStatus: "blocked",
        companyStatus: "pending",
        minCompletion: "10",
        maxCompletion: " 80 ",
        offset: 20,
      }),
    ).toBe(
      "user_type=candidate&account_status=blocked&company_status=pending&min_completion=10&max_completion=80&limit=20&offset=20",
    );
  });

  it("rejects a completion bound outside 0 to 100 and an inverted range", () => {
    expect(
      accountFiltersError({ ...defaultAccountFilters, minCompletion: "101" }),
    ).toBe("Informe a conclusão com um número de 0 a 100.");
    expect(
      accountFiltersError({
        ...defaultAccountFilters,
        minCompletion: "80",
        maxCompletion: "10",
      }),
    ).toBe("A conclusão mínima não pode ser maior que a máxima.");
    expect(accountFiltersError(defaultAccountFilters)).toBeNull();
  });

  it("requires a justification of at most 500 characters", () => {
    expect(accountStatusValuesSchema.safeParse({ reason: "  " }).success).toBe(
      false,
    );
    expect(
      accountStatusValuesSchema.safeParse({ reason: "x".repeat(501) }).success,
    ).toBe(false);
    expect(
      accountStatusValuesSchema.safeParse({ reason: "  Relato sintético.  " })
        .data?.reason,
    ).toBe("Relato sintético.");
  });
});

describe("account requests", () => {
  it("reads one page of accounts", async () => {
    stub = stubApiRoutes({
      "GET /admin/accounts?limit=20&offset=0": {
        status: 200,
        data: { items: [candidate], total: 1 },
      },
    });

    await expect(fetchAccounts(defaultAccountFilters)).resolves.toMatchObject({
      total: 1,
      items: [{ email: "candidate@example.invalid" }],
    });
  });

  it("rejects an unexpected list", async () => {
    stub = stubApiRoutes({
      "GET /admin/accounts?limit=20&offset=0": { status: 200, data: [] },
    });

    await expect(fetchAccounts(defaultAccountFilters)).rejects.toMatchObject({
      code: "invalid_account_list_response",
    });
  });

  it("sends the new status and the justification", async () => {
    stub = stubApiRoutes({
      [`PATCH /admin/accounts/${candidate.id}/status`]: {
        status: 200,
        data: { id: candidate.id, account_status: "blocked" },
      },
    });

    await changeAccountStatus(candidate.id, "blocked", {
      reason: "Relato sintético.",
    });

    expect(stub.requests[0]?.body).toEqual({
      status: "blocked",
      reason: "Relato sintético.",
    });
  });

  it("rejects an unexpected status answer", async () => {
    stub = stubApiRoutes({
      [`PATCH /admin/accounts/${candidate.id}/status`]: {
        status: 200,
        data: { id: candidate.id },
      },
    });

    await expect(
      changeAccountStatus(candidate.id, "active", { reason: "Relato." }),
    ).rejects.toMatchObject({ code: "invalid_account_status_response" });
  });

  it("reads the registration detail used by the modal", async () => {
    stub = stubApiRoutes({
      [`GET /admin/accounts/${candidate.id}`]: {
        status: 200,
        data: {
          ...candidate,
          application_count: 4,
          summary: "Resumo sintético.",
          experiences: [],
          education: [],
          skills: [],
          legal_name: null,
          trade_name: null,
          cnpj: null,
          corporate_email: null,
          city: null,
          state: null,
          industry: null,
          company_size: null,
          published_job_count: null,
        },
      },
    });

    await expect(fetchAccountDetail(candidate.id)).resolves.toMatchObject({
      summary: "Resumo sintético.",
      application_count: 4,
    });
    expect(stub.requests[0]?.url).toBe(`/admin/accounts/${candidate.id}`);
  });
});

describe("account error messages", () => {
  it("explains who can open the list", () => {
    expect(
      accountsErrorMessage(
        new ApiError({
          message: "no",
          status: 403,
          code: "administrator_required",
        }),
      ),
    ).toBe("Apenas administradores podem consultar as contas.");
    expect(
      accountsErrorMessage(
        new ApiError({
          message: "no",
          status: 422,
          code: "invalid_completion_range",
        }),
      ),
    ).toBe("A conclusão mínima não pode ser maior que a máxima.");
    expect(accountsErrorMessage(new Error("offline"))).toBe(
      "Não foi possível carregar as contas. Tente novamente.",
    );
  });

  it("explains a refused status change", () => {
    expect(
      statusChangeErrorMessage(
        new ApiError({ message: "no", status: 404, code: "account_not_found" }),
      ),
    ).toBe("Esta conta não está mais disponível. Atualize a lista.");
    expect(
      statusChangeErrorMessage(
        new ApiError({
          message: "no",
          status: 409,
          code: "account_already_blocked",
        }),
      ),
    ).toBe("Esta conta já está bloqueada.");
    expect(
      statusChangeErrorMessage(
        new ApiError({
          message: "no",
          status: 409,
          code: "account_already_active",
        }),
      ),
    ).toBe("Esta conta já está ativa.");
    expect(
      statusChangeErrorMessage(
        new ApiError({
          message: "no",
          status: 403,
          code: "administrator_required",
        }),
      ),
    ).toBe("Apenas administradores podem alterar o status da conta.");
    expect(
      statusChangeErrorMessage(
        new ApiError({ message: "no", status: 422, code: "validation_error" }),
      ),
    ).toBe("Escreva a justificativa com até 500 caracteres.");
    expect(statusChangeErrorMessage(new Error("offline"))).toBe(
      "Não foi possível alterar o status. A justificativa foi mantida; tente novamente.",
    );
  });
});
