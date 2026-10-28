import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";

import {
  type ApiStub,
  type StubRoute,
  stubApiRoutes,
} from "../../../tests/api-stub";
import { type DownloadStub, stubDownloads } from "../../../tests/download-stub";
import { DashboardPage } from "./dashboard-page";

const summary = {
  filters: {
    start_date: null,
    end_date: null,
    account_status: null,
    candidate_availability: null,
    company_status: null,
    job_status: null,
    application_status: null,
  },
  totals: { candidates: 4, companies: 3, jobs: 6, applications: 2, matches: 2 },
  segments: {
    candidates_without_placement: 2,
    candidates_with_unknown_employment: 1,
    incomplete_resumes: 3,
  },
};
const base = "GET /indicators";
let stub: ApiStub | undefined;
let downloads: DownloadStub | undefined;
afterEach(() => {
  stub?.restore();
  downloads?.restore();
  downloads = undefined;
});

function mount(routes: Record<string, StubRoute>) {
  stub = stubApiRoutes(routes);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <DashboardPage />
    </QueryClientProvider>,
  );
  return { user: userEvent.setup(), client };
}

it("shows loading followed by all eight indicators and their definitions", async () => {
  mount({ [base]: { status: 200, data: summary } });
  expect(screen.getByRole("status")).toHaveTextContent("Carregando");
  expect(
    await screen.findByText("Currículos incompletos", { selector: "dt" }),
  ).toBeVisible();
  expect(
    screen.getByText("Matches", { selector: "dt" }).nextElementSibling,
  ).toHaveTextContent("2");
  expect(
    screen.getByText("Situação profissional não informada", { selector: "dt" })
      .nextElementSibling,
  ).toHaveTextContent("1");
  expect(screen.getAllByRole("term")).toHaveLength(8);
  expect(screen.getByText(/Matches são pares/)).toBeVisible();
});

it("applies all filters together only after confirmation and clears them", async () => {
  const params =
    "start_date=2026-10-01&end_date=2026-10-24&account_status=active&candidate_availability=available&company_status=approved&job_status=published&application_status=hired";
  const { user } = mount({
    [base]: { status: 200, data: summary },
    [`GET /indicators?${params}`]: {
      status: 200,
      data: { ...summary, totals: { ...summary.totals, applications: 1 } },
    },
  });
  await screen.findByText("Matches", { selector: "dt" });
  await user.type(screen.getByLabelText("Data inicial"), "2026-10-01");
  await user.type(screen.getByLabelText("Data final"), "2026-10-24");
  for (const [label, value] of [
    ["Status das contas", "active"],
    ["Disponibilidade do profissional", "available"],
    ["Situação da empresa", "approved"],
    ["Status das vagas", "published"],
    ["Status das candidaturas", "hired"],
  ] as const)
    await user.selectOptions(screen.getByLabelText(label), value);
  expect(stub?.requests).toHaveLength(1);
  expect(screen.getByText(/Aplique os filtros/)).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Aplicar filtros" }));
  await waitFor(() =>
    expect(
      screen.getByText("Candidaturas", { selector: "dt" }).nextElementSibling,
    ).toHaveTextContent("1"),
  );
  await user.click(screen.getByRole("button", { name: "Limpar filtros" }));
  expect(screen.getByLabelText("Data inicial")).toHaveValue("");
  expect(screen.getByLabelText("Situação da empresa")).toHaveValue("");
  await waitFor(() =>
    expect(
      screen.getByText("Candidaturas", { selector: "dt" }).nextElementSibling,
    ).toHaveTextContent("2"),
  );
});

it("rejects a reversed date range before making a request and clears its error on edit", async () => {
  const { user } = mount({ [base]: { status: 200, data: summary } });
  await screen.findByText("Matches", { selector: "dt" });
  await user.type(screen.getByLabelText("Data inicial"), "2026-10-24");
  await user.type(screen.getByLabelText("Data final"), "2026-10-01");
  await user.click(screen.getByRole("button", { name: "Aplicar filtros" }));
  expect(screen.getByRole("alert")).toHaveTextContent("data inicial");
  expect(screen.getByLabelText("Data inicial")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  expect(stub?.requests).toHaveLength(1);
  await user.clear(screen.getByLabelText("Data final"));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("retries failures and distinguishes an empty result from a failed request", async () => {
  let fail = true;
  const { user } = mount({
    [base]: () => {
      const status = fail ? 503 : 200;
      fail = false;
      return {
        status,
        data:
          status === 200
            ? {
                ...summary,
                totals: {
                  candidates: 0,
                  companies: 0,
                  jobs: 0,
                  applications: 0,
                  matches: 0,
                },
                segments: {
                  candidates_without_placement: 0,
                  candidates_with_unknown_employment: 0,
                  incomplete_resumes: 0,
                },
              }
            : { status: 503, title: "Unavailable" },
      };
    },
  });
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "carregar os indicadores",
  );
  expect(screen.queryByText(/Nenhum registro/)).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
  expect(
    await screen.findByText("Nenhum registro encontrado com estes filtros."),
  ).toBeVisible();
});

it("does not show previous totals as current when a refresh fails", async () => {
  let fail = false;
  const { client } = mount({
    [base]: () => ({ status: fail ? 503 : 200, data: fail ? {} : summary }),
  });
  await screen.findByText("Matches", { selector: "dt" });
  fail = true;
  await client.invalidateQueries({ queryKey: ["administrator", "dashboard"] });
  expect(await screen.findByRole("alert")).toBeVisible();
  expect(
    screen.queryByText("Matches", { selector: "dt" }),
  ).not.toBeInTheDocument();
});

it("rejects a malformed successful response instead of rendering invalid totals", async () => {
  mount({
    [base]: {
      status: 200,
      data: { ...summary, totals: { ...summary.totals, matches: -1 } },
    },
  });
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "carregar os indicadores",
  );
  expect(
    screen.queryByText("Matches", { selector: "dt" }),
  ).not.toBeInTheDocument();
});

it("exports the applied filters, never an unapplied draft", async () => {
  const { saved } = (downloads = stubDownloads());
  const csv = { status: 200, data: new Blob(["Item;Valor\r\n"]) };
  const { user } = mount({
    [base]: { status: 200, data: summary },
    "GET /indicators?job_status=published": { status: 200, data: summary },
    "GET /indicators/export": csv,
    "GET /indicators/export?job_status=published": csv,
  });
  await screen.findByText("Matches", { selector: "dt" });
  const exportButton = screen.getByRole("button", { name: "Exportar dados" });

  await user.selectOptions(
    screen.getByLabelText("Status das vagas"),
    "published",
  );
  await user.click(exportButton);
  await screen.findByText("Arquivo CSV exportado.");
  expect(stub?.requests.at(-1)?.url).toBe("/indicators/export");

  await user.click(screen.getByRole("button", { name: "Aplicar filtros" }));
  await user.click(exportButton);
  await waitFor(() => expect(saved).toHaveLength(2));
  expect(stub?.requests.at(-1)?.url).toBe(
    "/indicators/export?job_status=published",
  );
});
