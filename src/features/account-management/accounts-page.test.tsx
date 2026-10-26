import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import {
  stubApiRoutes,
  type ApiStub,
  type StubRoute,
} from "../../../tests/api-stub";

import { AccountsPage } from "./accounts-page";

const candidate = {
  id: "60000000-0000-4000-8000-000000000001",
  user_type: "candidate",
  email: "candidate@example.invalid",
  display_name: "Pessoa Sintética",
  account_status: "active",
  company_status: null,
  completion_percentage: 70,
  missing_fields: ["summary"],
  created_at: "2026-10-20T18:00:00Z",
};
const company = {
  id: "60000000-0000-4000-8000-000000000002",
  user_type: "company",
  email: "company@example.invalid",
  display_name: "Empresa Sintética",
  account_status: "blocked",
  company_status: "approved",
  completion_percentage: null,
  missing_fields: null,
  created_at: "2026-10-19T18:00:00Z",
};
const suspended = {
  ...candidate,
  id: "60000000-0000-4000-8000-000000000003",
  display_name: null,
  email: "suspended@example.invalid",
  account_status: "suspended",
  completion_percentage: 0,
};
const firstPage = "GET /admin/accounts?limit=20&offset=0";
const statusRoute = `PATCH /admin/accounts/${candidate.id}/status`;

function candidateDetail(
  account: typeof candidate | typeof suspended = candidate,
) {
  return {
    ...account,
    application_count: 4,
    summary: "Resumo sintético de operações.",
    experiences: [
      {
        id: "61000000-0000-4000-8000-000000000001",
        role: "Gerente de operações",
        company_name: "Empresa Sintética",
        start_date: "2012-01-01",
        end_date: "2023-12-01",
      },
    ],
    education: [
      {
        id: "62000000-0000-4000-8000-000000000001",
        institution: "Instituto Sintético",
        degree: "MBA",
        field: "Gestão",
        start_date: "2010-01-01",
        end_date: "2011-12-01",
      },
    ],
    skills: [{ id: "63000000-0000-4000-8000-000000000001", name: "Logística" }],
    legal_name: null,
    trade_name: null,
    cnpj: null,
    corporate_email: null,
    city: null,
    state: null,
    industry: null,
    company_size: null,
    published_job_count: null,
  };
}

function companyDetail(account: typeof company = company) {
  return {
    ...account,
    application_count: null,
    summary: null,
    experiences: [],
    education: [],
    skills: [],
    legal_name: "Empresa Sintética Ltda.",
    trade_name: "Empresa Sintética",
    cnpj: "11222333000181",
    corporate_email: "contato@example.invalid",
    city: "Porto Alegre",
    state: "RS",
    industry: "Logística",
    company_size: "medium",
    published_job_count: 3,
  };
}

let stub: ApiStub | undefined;

it("uses US-08 completeness instead of the stored percentage and resets the page when filtering", async () => {
  const complete = {
    ...candidate,
    completion_percentage: 0,
    missing_fields: [],
  };
  const user = mount({}, (request) => ({
    status: 200,
    data: request.url?.includes("completeness=complete")
      ? { items: [complete], total: 1 }
      : { items: [candidate], total: 21 },
  }));
  await shown("Pessoa Sintética");
  expect(
    row("Pessoa Sintética").getByText("Currículo incompleto"),
  ).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Próxima" }));
  await screen.findByText("21–21 de 21");
  await user.selectOptions(
    screen.getByLabelText("Currículo do profissional"),
    "complete",
  );
  await screen.findByText("Currículo completo");
  expect(screen.queryByText("0% completo")).not.toBeInTheDocument();
  expect(stub?.requests.at(-1)?.url).toBe(
    "/admin/accounts?completeness=complete&limit=20&offset=0",
  );
  expect(screen.getByRole("button", { name: "Anterior" })).toBeDisabled();
});

it("keeps the previous page reachable after the last active row is blocked", async () => {
  let removed = false;
  const firstRows = Array.from({ length: 20 }, (_, index) => ({
    ...candidate,
    id: "71000000-0000-4000-8000-" + String(index + 1).padStart(12, "0"),
    display_name: "Synthetic professional " + (index + 1),
  }));
  const user = mount(
    {
      ["GET /admin/accounts/" + candidate.id]: {
        status: 200,
        data: candidateDetail(),
      },
      [statusRoute]: () => {
        removed = true;
        return {
          status: 200,
          data: { id: candidate.id, account_status: "blocked" },
        };
      },
    },
    (request) => ({
      status: 200,
      data: {
        items: request.url?.includes("offset=20")
          ? removed
            ? []
            : [candidate]
          : firstRows,
        total: removed ? 20 : 21,
      },
    }),
  );
  await shown("Synthetic professional 1");
  await user.selectOptions(screen.getByLabelText("Status da conta"), "active");
  await user.click(screen.getByRole("button", { name: "Próxima" }));
  await shown("Pessoa Sintética");
  await user.click(
    screen.getByRole("button", { name: "Ver cadastro de Pessoa Sintética" }),
  );
  await user.type(
    screen.getByLabelText("Justificativa"),
    "Verificação sintética.",
  );
  await user.click(screen.getByRole("button", { name: "Bloquear" }));
  await screen.findByText(
    "Não há mais contas nesta página. Volte para a página anterior.",
  );
  expect(screen.getByRole("button", { name: "Anterior" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Próxima" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Anterior" }));
  await shown("Synthetic professional 1");
  await waitFor(() => expect(screen.getByText("1–20 de 20")).toBeVisible());
});

afterEach(() => {
  stub?.restore();
  stub = undefined;
});

function mount(routes: Record<string, StubRoute>, fallback?: StubRoute) {
  stub = stubApiRoutes(routes, fallback);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <AccountsPage />
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

function row(name: string) {
  const header = screen.getByRole("rowheader", { name });
  const tableRow = header.closest("tr");
  if (!(tableRow instanceof HTMLElement)) {
    throw new Error(`Missing row for ${name}`);
  }
  return within(tableRow);
}

async function shown(name: string) {
  return screen.findByRole("rowheader", { name });
}

describe("AccountsPage", () => {
  it("lists professionals and companies with status and situation", async () => {
    mount({
      [firstPage]: {
        status: 200,
        data: { items: [candidate, company], total: 2 },
      },
    });

    expect(
      await screen.findByRole("heading", { name: "Cadastros" }),
    ).toBeVisible();
    await shown("Pessoa Sintética");
    await shown("Empresa Sintética");
    expect(row("Pessoa Sintética").getByText("Ativa")).toBeVisible();
    expect(
      row("Pessoa Sintética").getByText("Currículo incompleto"),
    ).toBeVisible();
    expect(row("Pessoa Sintética").getByText("Profissional")).toBeVisible();
    expect(row("Empresa Sintética").getByText("Bloqueada")).toBeVisible();
    expect(row("Empresa Sintética").getByText("Aprovada")).toBeVisible();
    expect(row("Empresa Sintética").getByText("Empresa")).toBeVisible();
    expect(
      row("Pessoa Sintética").getByRole("button", {
        name: "Ver cadastro de Pessoa Sintética",
      }),
    ).toBeVisible();
    expect(
      row("Empresa Sintética").getByRole("button", {
        name: "Ver cadastro de Empresa Sintética",
      }),
    ).toBeVisible();
  });

  it("asks for a justification before blocking and records it", async () => {
    const user = mount({
      [firstPage]: {
        status: 200,
        data: { items: [candidate], total: 1 },
      },
      [statusRoute]: {
        status: 200,
        data: { id: candidate.id, account_status: "blocked" },
      },
      [`GET /admin/accounts/${candidate.id}`]: {
        status: 200,
        data: candidateDetail(),
      },
    });
    await shown("Pessoa Sintética");

    await user.click(
      screen.getByRole("button", {
        name: "Ver cadastro de Pessoa Sintética",
      }),
    );
    expect(
      await screen.findByText("Resumo sintético de operações."),
    ).toBeVisible();
    expect(screen.getByText("2012 – 2023")).toBeVisible();
    expect(
      screen.getByText(/MBA em Gestão · Instituto Sintético · 2011/),
    ).toBeVisible();
    expect(screen.getByText("Logística")).toBeVisible();
    expect(screen.getByText(/4 candidaturas/)).toBeVisible();
    expect(screen.queryByText(/saem da busca/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Bloquear" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Escreva a justificativa antes de confirmar.",
    );

    await user.type(
      screen.getByLabelText("Justificativa"),
      "Relato sintético de abuso.",
    );
    await user.click(screen.getByRole("button", { name: "Bloquear" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Conta de Pessoa Sintética bloqueada.",
    );
    expect(
      stub?.requests.find((request) => request.method === "patch")?.body,
    ).toEqual({
      status: "blocked",
      reason: "Relato sintético de abuso.",
    });
  });

  it("unblocks a company from the same button and explains that its jobs return to search", async () => {
    const user = mount({
      [firstPage]: {
        status: 200,
        data: { items: [company], total: 1 },
      },
      [`GET /admin/accounts/${company.id}`]: {
        status: 200,
        data: companyDetail(),
      },
      [`PATCH /admin/accounts/${company.id}/status`]: {
        status: 200,
        data: { id: company.id, account_status: "active" },
      },
    });
    await shown("Empresa Sintética");

    await user.click(
      screen.getByRole("button", {
        name: "Ver cadastro de Empresa Sintética",
      }),
    );
    expect(await screen.findByText("11.222.333/0001-81")).toBeVisible();
    expect(screen.getByText("Média")).toBeVisible();
    expect(screen.getByText(/3 vagas publicadas/)).toBeVisible();
    expect(screen.getByText(/voltam a aparecer na busca/i)).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Resumo" }),
    ).not.toBeInTheDocument();
    await user.type(
      screen.getByLabelText("Justificativa"),
      "Revisão concluída.",
    );
    await user.click(screen.getByRole("button", { name: "Desbloquear" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Conta de Empresa Sintética desbloqueada.",
    );
    expect(
      stub?.requests.find((request) => request.method === "patch")?.body,
    ).toEqual({
      status: "active",
      reason: "Revisão concluída.",
    });
  });

  it("explains that blocking a company removes its jobs from search", async () => {
    const user = mount({
      [firstPage]: {
        status: 200,
        data: {
          items: [{ ...company, account_status: "active" }],
          total: 1,
        },
      },
      [`GET /admin/accounts/${company.id}`]: {
        status: 200,
        data: companyDetail({ ...company, account_status: "active" }),
      },
    });
    await shown("Empresa Sintética");

    await user.click(
      screen.getByRole("button", {
        name: "Ver cadastro de Empresa Sintética",
      }),
    );

    expect(await screen.findByText(/saem da busca/i)).toBeVisible();
    expect(screen.getByRole("button", { name: "Bloquear" })).toBeVisible();
  });

  it("uses Bloquear for a suspended account and keeps the same button", async () => {
    const user = mount({
      [firstPage]: {
        status: 200,
        data: { items: [suspended], total: 1 },
      },
      [`GET /admin/accounts/${suspended.id}`]: {
        status: 200,
        data: candidateDetail(suspended),
      },
    });

    expect(await shown("suspended@example.invalid")).toBeVisible();
    await user.click(
      screen.getByRole("button", {
        name: "Ver cadastro de suspended@example.invalid",
      }),
    );
    expect(
      await screen.findByRole("button", { name: "Bloquear" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Desbloquear" }),
    ).not.toBeInTheDocument();
  });

  it("sends the combined filters and pages through the total", async () => {
    const user = mount({}, (request) => {
      const url = request.url ?? "";
      if (url.includes("offset=20")) {
        return { status: 200, data: { items: [company], total: 21 } };
      }
      if (
        url.includes("user_type=company") &&
        url.includes("account_status=active") &&
        url.includes("company_status=approved")
      ) {
        return { status: 200, data: { items: [], total: 0 } };
      }
      return { status: 200, data: { items: [candidate], total: 21 } };
    });
    await shown("Pessoa Sintética");

    await user.selectOptions(screen.getByLabelText("Tipo"), "company");
    await user.selectOptions(
      screen.getByLabelText("Status da conta"),
      "active",
    );
    await user.selectOptions(
      screen.getByLabelText("Situação da empresa"),
      "approved",
    );

    expect(
      await screen.findByText("Nenhuma conta encontrada com esses filtros."),
    ).toBeVisible();
    expect(stub?.requests.at(-1)?.url).toBe(
      "/admin/accounts?user_type=company&account_status=active&company_status=approved&limit=20&offset=0",
    );

    await user.selectOptions(screen.getByLabelText("Tipo"), "all");
    await user.selectOptions(screen.getByLabelText("Status da conta"), "all");
    await user.selectOptions(
      screen.getByLabelText("Situação da empresa"),
      "all",
    );
    await shown("Pessoa Sintética");

    await user.click(screen.getByRole("button", { name: "Próxima" }));
    expect(await shown("Empresa Sintética")).toBeVisible();
    expect(screen.getByText("21–21 de 21")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Anterior" }));
    expect(await shown("Pessoa Sintética")).toBeVisible();
    expect(screen.getByText("1–1 de 21")).toBeVisible();
  });

  it("explains a refused list and a refused status change", async () => {
    const user = mount({
      [firstPage]: {
        status: 403,
        data: {
          title: "Forbidden",
          status: 403,
          code: "administrator_required",
        },
      },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Apenas administradores podem consultar as contas.",
    );

    stub?.restore();
    stub = stubApiRoutes({
      [firstPage]: { status: 200, data: { items: [candidate], total: 1 } },
      [`GET /admin/accounts/${candidate.id}`]: {
        status: 200,
        data: candidateDetail(),
      },
      [statusRoute]: {
        status: 409,
        data: {
          title: "Conflict",
          status: 409,
          code: "account_already_blocked",
        },
      },
    });
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await shown("Pessoa Sintética");
    await user.click(
      screen.getByRole("button", {
        name: "Ver cadastro de Pessoa Sintética",
      }),
    );
    await user.type(
      screen.getByLabelText("Justificativa"),
      "Relato sintético.",
    );
    await user.click(screen.getByRole("button", { name: "Bloquear" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Esta conta já está bloqueada.",
    );
    expect(screen.getByLabelText("Justificativa")).toHaveValue(
      "Relato sintético.",
    );
  });

  it("shows a generic failure for an unexpected answer", async () => {
    mount({ [firstPage]: { status: 200, data: { items: [{ id: 1 }] } } });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar as contas. Tente novamente.",
    );
  });
});
