import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import {
  stubApiRoutes,
  type ApiStub,
  type StubRoute,
} from "../../../tests/api-stub";
import { JobCandidatesPage } from "./job-candidates-page";

const jobId = "11111111-1111-4111-8111-111111111111";
const applicationId = "22222222-2222-4222-8222-222222222222";
const candidateId = "33333333-3333-4333-8333-333333333333";
const skillId = "55555555-5555-4555-8555-555555555555";
const job = {
  id: jobId,
  company_id: "44444444-4444-4444-8444-444444444444",
  title: "Analista de operações",
  description: "Vaga de operações",
  skills: [],
  work_mode: "remote",
  closing_date: "2099-12-31",
  status: "published",
  published_at: "2026-09-23T12:00:00Z",
  created_at: "2026-09-23T12:00:00Z",
  application_count: 1,
};
const applicant = {
  origin: "application",
  compatibility_percentage: "100.00",
  is_highlighted: true,
  application_id: applicationId,
  status: "applied",
  match_score: null,
  matched_skill_count: 2,
  required_skill_count: 2,
  matched_skills: [{ id: skillId, name: "Excel" }],
  missing_skills: [],
  profile: {
    candidate_id: candidateId,
    full_name: "Pessoa Exemplo",
    city: "Porto Alegre",
    state: "RS",
  },
};
const summary = {
  job_id: jobId,
  total_applicant_count: 1,
  full_match_count: 1,
  automatic_match_count: 0,
  applicants: [applicant],
};
const profile = {
  application_id: applicationId,
  candidate_id: candidateId,
  full_name: "Pessoa Exemplo",
  city: "Porto Alegre",
  state: "RS",
  summary: "Experiência em operações.",
  experiences: [
    {
      id: skillId,
      role: "Analista",
      company_name: "Empresa Exemplo",
      start_date: "2020-01-01",
      end_date: null,
      description: "Atuação em operações.",
    },
  ],
  education: [
    {
      id: skillId,
      institution: "Instituição Exemplo",
      degree: "Graduação",
      field: "Administração",
      start_date: null,
      end_date: null,
    },
  ],
  certifications: [
    {
      id: skillId,
      name: "Certificação Exemplo",
      issuer: "Emissor Exemplo",
      issued_date: "2021-01-01",
      expiration_date: "2099-12-31",
    },
  ],
  skills: [{ id: skillId, name: "Excel", type: "hard" }],
};
let stub: ApiStub | undefined;
afterEach(() => {
  stub?.restore();
  stub = undefined;
});

function routes(initialStatus = "applied"): Record<string, StubRoute> {
  let status = initialStatus;
  return {
    "GET /jobs/me": { status: 200, data: [job] },
    [`GET /jobs/${jobId}/applications`]: () => ({
      status: 200,
      data: { ...summary, applicants: [{ ...applicant, status }] },
    }),
    [`GET /applications/${applicationId}/profile`]: {
      status: 200,
      data: profile,
    },
    [`PATCH /applications/${applicationId}/status`]: (request) => {
      status = (request.body as { status: string }).status;
      return {
        status: 200,
        data: {
          application_id: applicationId,
          job_id: jobId,
          candidate_id: candidateId,
          status,
          updated_at: "2026-10-07T12:00:00Z",
        },
      };
    },
  };
}
function mount(responses = routes(), initialJobId?: string) {
  stub = stubApiRoutes(responses);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <JobCandidatesPage initialJobId={initialJobId} />
    </QueryClientProvider>,
  );
  return userEvent.setup();
}
async function openCandidates(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole("button", { name: /Ver candidatos de/ }),
  );
}

describe("JobCandidatesPage", () => {
  it("shows job counts, current compatibility criteria, and the safe professional profile", async () => {
    const user = mount();
    expect(
      await screen.findByText("1 candidatos · 1 atendem a todos os requisitos"),
    ).toBeVisible();
    await openCandidates(user);
    expect(screen.getByText("Atende 2 de 2 requisitos")).toBeVisible();
    expect(screen.getByText("Atende: Excel.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Ver perfil" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(
      await within(dialog).findByText("Experiência em operações."),
    ).toBeVisible();
    expect(
      within(dialog).getByText("Analista · Empresa Exemplo"),
    ).toBeVisible();
    expect(within(dialog).getByText("Instituição Exemplo")).toBeVisible();
    expect(within(dialog).getByText("Certificação Exemplo")).toBeVisible();
    expect(within(dialog).getByText("Válido até 31/12/2099")).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Fechar" }));
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
  });

  it("advances an application through review and selection to hiring", async () => {
    const user = mount();
    await openCandidates(user);
    await user.click(screen.getByRole("button", { name: "Iniciar análise" }));
    await user.click(
      await screen.findByRole("button", { name: "Avançar para seleção" }),
    );
    await user.click(await screen.findByRole("button", { name: "Selecionar" }));
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(
      await screen.findByText("Selecionado", { exact: true }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Iniciar análise" }),
    ).not.toBeInTheDocument();
    expect(
      stub?.requests
        .filter((request) => request.method === "patch")
        .map((request) => request.body),
    ).toEqual([
      { status: "under_review" },
      { status: "in_selection_process" },
      { status: "hired" },
    ]);
  });

  it("requires a trimmed rejection reason and keeps terminal applications read-only", async () => {
    const user = mount(routes("under_review"));
    await openCandidates(user);
    await user.click(screen.getByRole("button", { name: "Não selecionar" }));
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled();
    await user.type(
      screen.getByRole("textbox", { name: "Motivo para o candidato" }),
      "  Perfil não alinhado com a vaga.  ",
    );
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(
      await screen.findByText("Não selecionado", { exact: true }),
    ).toBeVisible();
    expect(
      stub?.requests.find((request) => request.method === "patch")?.body,
    ).toEqual({
      status: "not_selected",
      reason: "Perfil não alinhado com a vaga.",
    });
    expect(
      screen.queryByRole("button", { name: "Avançar para seleção" }),
    ).not.toBeInTheDocument();
  });

  it("cancels a final decision without sending a status update", async () => {
    const user = mount(routes("in_selection_process"));
    await openCandidates(user);
    await user.click(screen.getByRole("button", { name: "Selecionar" }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(stub?.requests.some((request) => request.method === "patch")).toBe(
      false,
    );
  });

  it("accepts automatic matches without offering them application actions or profiles", async () => {
    const responses = routes();
    responses[`GET /jobs/${jobId}/applications`] = {
      status: 200,
      data: {
        ...summary,
        automatic_match_count: 1,
        applicants: [
          applicant,
          {
            ...applicant,
            origin: "automatic_match",
            application_id: null,
            status: null,
            profile: {
              ...applicant.profile,
              candidate_id: skillId,
              full_name: "Perfil automático",
            },
          },
        ],
      },
    };
    const user = mount(responses);
    await openCandidates(user);
    expect(
      screen.getByText("1 perfis com match automático, sem candidatura."),
    ).toBeVisible();
    expect(screen.queryByText("Perfil automático")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Ver perfil" })).toHaveLength(
      1,
    );
  });

  it("opens the requested job directly and handles a job without applicants", async () => {
    const responses = routes();
    responses[`GET /jobs/${jobId}/applications`] = {
      status: 200,
      data: {
        ...summary,
        total_applicant_count: 0,
        full_match_count: 0,
        applicants: [],
      },
    };
    mount(responses, jobId);
    expect(
      await screen.findByText("Nenhum candidato ainda para esta vaga."),
    ).toBeVisible();
  });

  it("handles an empty company job list", async () => {
    mount({ "GET /jobs/me": { status: 200, data: [] } });
    expect(
      await screen.findByText("Você ainda não publicou vagas."),
    ).toBeVisible();
  });

  it("retries a failed candidate listing", async () => {
    const responses = routes();
    let attempts = 0;
    responses[`GET /jobs/${jobId}/applications`] = () =>
      ++attempts === 1 ? { status: 503 } : { status: 200, data: summary };
    const user = mount(responses);
    expect(
      await screen.findByText("Não foi possível carregar os candidatos."),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(
      await screen.findByRole("button", { name: /Ver candidatos de/ }),
    ).toBeVisible();
  });

  it("keeps a failed rejection dialog open with the entered reason for retry", async () => {
    const responses = routes("under_review");
    responses[`PATCH /applications/${applicationId}/status`] = { status: 503 };
    const user = mount(responses);
    await openCandidates(user);
    await user.click(screen.getByRole("button", { name: "Não selecionar" }));
    await user.type(
      screen.getByRole("textbox", { name: "Motivo para o candidato" }),
      "Motivo de exemplo.",
    );
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    const dialog = screen.getByRole("alertdialog");
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Não foi possível atualizar",
    );
    expect(within(dialog).getByRole("textbox")).toHaveValue(
      "Motivo de exemplo.",
    );
    expect(
      within(dialog).getByRole("button", { name: "Confirmar" }),
    ).toBeEnabled();
  });

  it("refreshes a concurrently closed application and explains the conflict", async () => {
    const responses = routes();
    responses[`PATCH /applications/${applicationId}/status`] = () => {
      responses[`GET /jobs/${jobId}/applications`] = {
        status: 200,
        data: {
          ...summary,
          applicants: [{ ...applicant, status: "withdrawn" }],
        },
      };
      return {
        status: 409,
        data: {
          title: "Conflict",
          status: 409,
          code: "application_already_closed",
        },
      };
    };
    const user = mount(responses);
    await openCandidates(user);
    await user.click(screen.getByRole("button", { name: "Iniciar análise" }));
    expect(await screen.findByText(/A candidatura mudou/)).toBeVisible();
    expect(await screen.findByText("Candidatura retirada")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Iniciar análise" }),
    ).not.toBeInTheDocument();
  });

  it("retries a failed profile request", async () => {
    const responses = routes();
    let attempts = 0;
    responses[`GET /applications/${applicationId}/profile`] = () =>
      ++attempts === 1 ? { status: 503 } : { status: 200, data: profile };
    const user = mount(responses);
    await openCandidates(user);
    await user.click(screen.getByRole("button", { name: "Ver perfil" }));
    expect(
      await screen.findByText("Não foi possível carregar o perfil."),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByText("Experiência em operações.")).toBeVisible();
  });
});
