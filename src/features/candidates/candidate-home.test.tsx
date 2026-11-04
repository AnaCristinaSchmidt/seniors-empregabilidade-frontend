import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterContextProvider,
} from "@tanstack/react-router";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "@/lib/api-client";

import { CandidateHome } from "./candidate-home";

vi.mock("@/lib/api-client", () => ({
  apiClient: { get: vi.fn() },
}));

const profile = {
  id: "00000000-0000-4000-8000-000000000001",
  full_name: "Maria Aparecida Souza",
  age: 58,
  email: "maria@example.invalid",
  phone: "51999990000",
  city: "Porto Alegre",
  state: "RS",
  summary: null,
  experiences: [],
  education: [],
  certifications: [],
  skills: [],
  missing_fields: ["summary", "experiences", "education", "skills"],
  completion_percentage: 33,
  accepts_automatic_application: false,
};

function application(index: number, status = "under_review") {
  return {
    id: `00000000-0000-4000-8000-00000000a00${index}`,
    job_id: `00000000-0000-4000-8000-00000000b00${index}`,
    job_title: `Vaga ${index}`,
    company_name: `Empresa ${index}`,
    submitted_at: `2026-10-0${index}T15:00:00Z`,
    days_in_process: index,
    status,
    similar_jobs: [],
  };
}

const job = {
  id: "00000000-0000-4000-8000-00000000c001",
  title: "Supervisor de Logística",
  company_name: "Move Distribuição",
  location: "São Paulo, SP",
  work_mode: "hybrid",
  salary_max: "8000.00",
  published_at: "2026-10-01T12:00:00Z",
  days_since_published: 3,
  matched_skill_count: 2,
  required_skill_count: 3,
  missing_skills: [{ id: "s1", name: "Excel", type: "hard" }],
};

interface Responses {
  profile?: unknown;
  applications?: unknown;
  jobs?: unknown;
}

function stubApi(responses: Responses) {
  const answer = (value: unknown) =>
    value instanceof Error
      ? Promise.reject(value)
      : Promise.resolve({ data: value });

  return vi.spyOn(apiClient, "get").mockImplementation((url: string) => {
    if (url === "/professionals/me") {
      return answer(responses.profile ?? profile);
    }
    if (url === "/applications/me") {
      return answer(responses.applications ?? []);
    }
    if (url.startsWith("/jobs")) {
      return answer(responses.jobs ?? []);
    }
    return Promise.reject(new Error(`Unexpected request ${url}`));
  });
}

function renderHome() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createRouter({
    routeTree: createRootRoute(),
    history: createMemoryHistory({ initialEntries: ["/candidato"] }),
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterContextProvider router={router}>
        <CandidateHome />
      </RouterContextProvider>
    </QueryClientProvider>,
  );
}

function section(name: string) {
  return screen.getByRole("region", { name });
}

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("CandidateHome", () => {
  it("greets the candidate by first name", async () => {
    stubApi({});

    renderHome();

    expect(
      await screen.findByRole("heading", { level: 1, name: "Olá, Maria!" }),
    ).toBeVisible();
  });

  it("shows the percentage and the pending fields from the profile", async () => {
    stubApi({});

    renderHome();

    const card = section("Seu perfil");
    expect(await within(card).findByText("33% completo")).toBeVisible();
    expect(
      within(card).getByRole("progressbar", { name: "Completude do perfil" }),
    ).toHaveAttribute("aria-valuenow", "33");
    const pending = within(card).getAllByRole("listitem");
    expect(pending.map((item) => item.textContent)).toEqual([
      "Resumo profissional",
      "Experiência profissional",
      "Formação",
      "Habilidades",
    ]);
    expect(
      within(card).getByRole("link", { name: "Completar perfil" }),
    ).toHaveAttribute("href", "/candidato/perfil");
  });

  it("presents a complete profile without pending fields", async () => {
    stubApi({
      profile: { ...profile, missing_fields: [], completion_percentage: 100 },
    });

    renderHome();

    const card = section("Seu perfil");
    expect(await within(card).findByText("Perfil completo.")).toBeVisible();
    expect(within(card).getByText("100% completo")).toBeVisible();
    expect(within(card).queryByText("Ainda falta preencher:")).toBeNull();
    expect(within(card).queryByRole("listitem")).toBeNull();
    expect(
      within(card).getByRole("link", { name: "Ver meu perfil" }),
    ).toHaveAttribute("href", "/candidato/perfil");
  });

  it("omits the percentage when the backend does not send it", async () => {
    stubApi({ profile: { ...profile, completion_percentage: undefined } });

    renderHome();

    const card = section("Seu perfil");
    expect(await within(card).findByText("Formação")).toBeVisible();
    expect(within(card).queryByRole("progressbar")).toBeNull();
  });

  it("asks for the three most recent applications and lists them", async () => {
    const get = stubApi({
      applications: [
        application(4, "applied"),
        application(3, "in_selection_process"),
        application(2, "not_selected"),
        application(1),
      ],
    });

    renderHome();

    const card = section("Candidaturas recentes");
    expect(await within(card).findByText("Vaga 4")).toBeVisible();
    expect(get).toHaveBeenCalledWith(
      "/applications/me",
      expect.objectContaining({ params: { limit: 3 } }),
    );
    const items = within(card).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("Empresa 4 · Enviada em 4 de outubro");
    expect(items[0]).toHaveTextContent("Candidatura enviada");
    expect(items[1]).toHaveTextContent("Em processo seletivo");
    expect(items[2]).toHaveTextContent("Você não foi selecionado");
    expect(within(card).queryByText("Vaga 1")).toBeNull();
    expect(
      within(card).getByRole("link", { name: "Ver todas as candidaturas" }),
    ).toHaveAttribute("href", "/candidato/candidaturas");
  });

  it("guides a candidate without applications to the job search", async () => {
    stubApi({ applications: [] });

    renderHome();

    const card = section("Candidaturas recentes");
    expect(
      await within(card).findByText(/Você ainda não se candidatou/),
    ).toBeVisible();
    expect(
      within(card).getByRole("link", { name: "Buscar vagas" }),
    ).toHaveAttribute("href", "/candidato/vagas");
  });

  it("lists open jobs with the job search compatibility data", async () => {
    const get = stubApi({ jobs: [job] });

    renderHome();

    const card = section("Vagas abertas");
    const preview = await within(card).findByRole("article", {
      name: "Supervisor de Logística",
    });
    expect(get).toHaveBeenCalledWith(
      expect.stringMatching(/^\/jobs\?limit=3&offset=0$/),
      expect.anything(),
    );
    expect(within(preview).getByText("Move Distribuição")).toBeVisible();
    expect(
      within(preview).getByText(/São Paulo, SP · Híbrido · até R\$\s?8\.000/),
    ).toBeVisible();
    expect(preview).toHaveTextContent(
      "Você atende 2 dos 3 requisitos. Falta Excel.",
    );
    expect(
      within(preview).getByRole("link", {
        name: "Ver vaga Supervisor de Logística",
      }),
    ).toHaveAttribute("href", `/candidato/vagas/${job.id}`);
    expect(
      within(card).getByRole("link", { name: "Ver todas as vagas" }),
    ).toHaveAttribute("href", "/candidato/vagas");
  });

  it("leaves the salary out when the job has none", async () => {
    stubApi({ jobs: [{ ...job, salary_max: null, location: null }] });

    renderHome();

    const preview = await within(section("Vagas abertas")).findByRole(
      "article",
    );
    expect(within(preview).getByText("Híbrido")).toBeVisible();
    expect(preview).not.toHaveTextContent("R$");
  });

  it("explains when there are no open jobs", async () => {
    stubApi({ jobs: [] });

    renderHome();

    expect(
      await within(section("Vagas abertas")).findByText(
        /Não há vagas abertas no momento/,
      ),
    ).toBeVisible();
  });

  it("keeps the other cards when one source fails, and retries it", async () => {
    stubApi({
      applications: new Error("network"),
      jobs: [job],
    });
    const user = userEvent.setup();

    renderHome();

    const applications = section("Candidaturas recentes");
    expect(await within(applications).findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar suas candidaturas.",
    );
    expect(
      await within(section("Vagas abertas")).findByRole("article"),
    ).toBeVisible();
    expect(
      within(section("Seu perfil")).getByText("33% completo"),
    ).toBeVisible();

    stubApi({ applications: [application(1)], jobs: [job] });
    await user.click(
      within(applications).getByRole("button", { name: "Tentar novamente" }),
    );

    expect(await within(applications).findByText("Vaga 1")).toBeVisible();
    // The retry button is gone; focus stays in the card instead of the body.
    expect(
      within(applications).getByRole("heading", {
        name: "Candidaturas recentes",
      }),
    ).toHaveFocus();
  });

  it("falls back to a generic heading when the profile fails", async () => {
    stubApi({ profile: new Error("network"), jobs: [job] });

    renderHome();

    expect(
      await within(section("Seu perfil")).findByRole("alert"),
    ).toHaveTextContent("Não foi possível carregar o resumo do seu perfil.");
    expect(
      screen.getByRole("heading", { level: 1, name: "Área do candidato" }),
    ).toBeVisible();
    expect(
      await within(section("Vagas abertas")).findByRole("article"),
    ).toBeVisible();
  });

  it("announces each card while it loads", () => {
    vi.spyOn(apiClient, "get").mockReturnValue(new Promise(() => {}));

    renderHome();

    expect(screen.getByText("Carregando seu perfil...")).toBeInTheDocument();
    expect(
      screen.getByText("Carregando suas candidaturas..."),
    ).toBeInTheDocument();
    expect(screen.getByText("Carregando vagas abertas...")).toBeInTheDocument();
  });
});
