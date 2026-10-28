import {
  createRootRoute,
  createRouter,
  createMemoryHistory,
  RouterContextProvider,
} from "@tanstack/react-router";
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import {
  stubApiRoutes,
  type ApiStub,
  type StubResponse,
  type StubRoute,
} from "../../../tests/api-stub";

import { MyJobsPage } from "./my-jobs-page";

const published = {
  id: "11111111-1111-4111-8111-111111111111",
  company_id: "22222222-2222-4222-8222-222222222222",
  title: "Desenvolvedor(a) Frontend",
  description: "Vaga para atuar no time de frontend do produto.",
  skills: [
    { id: "33333333-3333-4333-8333-333333333333", name: "React", type: "hard" },
    {
      id: "44444444-4444-4444-8444-444444444444",
      name: "Comunicação",
      type: "soft",
    },
  ],
  work_mode: "remote",
  closing_date: "2099-12-31",
  status: "published",
  published_at: "2026-09-23T12:00:00Z",
  created_at: "2026-09-23T12:00:00Z",
};

const draft = {
  ...published,
  id: "55555555-5555-4555-8555-555555555555",
  title: "Analista de operações",
  description: "",
  skills: [] as typeof published.skills,
  work_mode: "onsite",
  closing_date: "2099-01-05",
  status: "draft",
  published_at: null,
};

const listedPublished = { ...published, application_count: 3 };
const listedDraft = { ...draft, application_count: 0 };
const listedClosed = {
  ...published,
  id: "66666666-6666-4666-8666-666666666666",
  title: "Auxiliar administrativo",
  status: "closed",
  application_count: 1,
};
const listedPastItsDate = {
  ...published,
  id: "77777777-7777-4777-8777-777777777777",
  title: "Operador(a) de caixa",
  closing_date: "2020-01-31",
  application_count: 0,
};

type ListedJob = typeof listedPublished | typeof listedDraft;

/**
 * A server that remembers status changes, so the list the page refetches
 * after a change shows it, as the real API would.
 */
function serverWith(initial: ListedJob[]): Record<string, StubRoute> {
  const jobs = new Map(initial.map((job) => [job.id, { ...job }]));
  const routes: Record<string, StubRoute> = {
    "GET /jobs/me": () => ({ status: 200, data: [...jobs.values()] }),
  };
  for (const job of initial) {
    routes[`PATCH /jobs/${job.id}/status`] = (request) => {
      const body = request.body as { status: string; closing_date?: string };
      const current = jobs.get(job.id) ?? job;
      const changed = {
        ...current,
        status: body.status === "closed" ? "closed" : "published",
        closing_date: body.closing_date ?? current.closing_date,
      };
      jobs.set(job.id, changed);
      return { status: 200, data: changed };
    };
  }
  return routes;
}

function statusRequests() {
  return (
    stub?.requests.filter(
      (request) =>
        request.method === "patch" && request.url?.endsWith("/status"),
    ) ?? []
  );
}

function card(title: string) {
  return within(screen.getByRole("article", { name: title }));
}

let stub: ApiStub | undefined;

afterEach(() => {
  stub?.restore();
  stub = undefined;
});

function mount(routes: Record<string, StubRoute>) {
  stub = stubApiRoutes({ "GET /skills": { status: 200, data: [] }, ...routes });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createRouter({
    routeTree: createRootRoute({ component: MyJobsPage }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterContextProvider router={router}>
        <MyJobsPage />
      </RouterContextProvider>
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

function listRequests() {
  return stub?.requests.filter((request) => request.url === "/jobs/me") ?? [];
}

async function publishThroughTheModal(user: UserEvent) {
  await user.click(screen.getByRole("button", { name: "Cadastrar nova vaga" }));
  await user.type(
    await screen.findByLabelText("Título da vaga *"),
    published.title,
  );
  await user.type(
    screen.getByLabelText("Descrição da vaga *"),
    published.description,
  );
  await user.click(screen.getByRole("radio", { name: "Remoto" }));
  await user.type(
    screen.getByLabelText("Data de encerramento *"),
    "2099-12-31",
  );
  const skills = screen.getByLabelText("Habilidades necessárias *");
  await user.type(skills, "React{Enter}");
  await user.click(screen.getByRole("radio", { name: "Comportamental" }));
  await user.type(skills, "Comunicação{Enter}");
  await user.click(screen.getByRole("button", { name: "Publicar vaga" }));
}

const EMPTY_STATE = /Você ainda não publicou vagas/;

describe("MyJobsPage", () => {
  it("announces while the jobs load", () => {
    mount({ "GET /jobs/me": () => new Promise<StubResponse>(() => {}) });

    expect(screen.getByText("Carregando suas vagas…")).toBeInTheDocument();
  });

  it("invites a company without jobs to publish the first one", async () => {
    mount({ "GET /jobs/me": { status: 200, data: [] } });

    expect(await screen.findByText(EMPTY_STATE)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Minhas vagas" }),
    ).toBeInTheDocument();
  });

  it("lists each job with its status, work mode, closing date, applications and skills", async () => {
    mount({
      "GET /jobs/me": { status: 200, data: [listedPublished, listedDraft] },
    });

    const publishedCard = within(
      await screen.findByRole("article", { name: published.title }),
    );
    expect(publishedCard.getByText("Aberta")).toBeInTheDocument();
    expect(
      publishedCard.getByText(
        "Remoto · Encerra em 31/12/2099 · 3 candidaturas",
      ),
    ).toBeInTheDocument();
    expect(publishedCard.getByText(published.description)).toBeInTheDocument();
    expect(
      publishedCard.getAllByRole("listitem").map((skill) => skill.textContent),
    ).toEqual(["React", "Comunicação"]);

    const draftCard = card(draft.title);
    expect(draftCard.getByText("Rascunho")).toBeInTheDocument();
    expect(
      draftCard.getByText(
        "Presencial · Encerra em 05/01/2099 · Nenhuma candidatura ainda",
      ),
    ).toBeInTheDocument();
  });

  it("counts only the jobs candidates can find as open", async () => {
    mount({
      "GET /jobs/me": {
        status: 200,
        data: [listedPublished, listedClosed, listedPastItsDate, listedDraft],
      },
    });

    expect(
      await screen.findByText("1 vaga aberta para candidatos"),
    ).toBeInTheDocument();
    expect(card(listedClosed.title).getByText("Encerrada")).toBeInTheDocument();
    expect(
      card(listedPastItsDate.title).getByText("Prazo encerrado"),
    ).toBeInTheDocument();
  });

  it("offers each job only the status action its state allows", async () => {
    mount({
      "GET /jobs/me": {
        status: 200,
        data: [listedPublished, listedClosed, listedPastItsDate, listedDraft],
      },
    });
    await screen.findByRole("article", { name: published.title });

    expect(
      card(published.title).getByRole("button", { name: "Encerrar" }),
    ).toBeInTheDocument();
    expect(
      card(listedClosed.title).getByRole("button", { name: "Reabrir" }),
    ).toBeInTheDocument();
    expect(
      card(listedPastItsDate.title).getByRole("button", { name: "Reabrir" }),
    ).toBeInTheDocument();
    const draftCard = card(draft.title);
    expect(
      draftCard.queryByRole("button", { name: /Encerrar|Reabrir/ }),
    ).not.toBeInTheDocument();
    // Every job can be edited, whatever its status.
    expect(screen.getAllByRole("button", { name: "Editar" })).toHaveLength(4);
    for (const edit of screen.getAllByRole("button", { name: "Editar" })) {
      expect(edit).toBeEnabled();
    }
  });

  it("closes a job only after the confirmation and shows it closed", async () => {
    const user = mount(serverWith([listedPublished]));
    await screen.findByRole("article", { name: published.title });

    await user.click(
      card(published.title).getByRole("button", { name: "Encerrar" }),
    );
    expect(
      await screen.findByRole("alertdialog", { name: "Encerrar a vaga?" }),
    ).toBeInTheDocument();
    expect(statusRequests()).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Encerrar vaga" }));

    expect(
      await screen.findByText(
        `A vaga “${published.title}” foi encerrada e saiu das buscas dos candidatos.`,
      ),
    ).toBeInTheDocument();
    expect(statusRequests().map((request) => request.body)).toEqual([
      { status: "closed" },
    ]);
    await waitFor(() =>
      expect(card(published.title).getByText("Encerrada")).toBeInTheDocument(),
    );
    expect(
      card(published.title).getByRole("button", { name: "Reabrir" }),
    ).toBeInTheDocument();
    expect(screen.getByText("0 vagas abertas para candidatos")).toBeVisible();
  });

  it("keeps the job open when the closing is cancelled", async () => {
    const user = mount(serverWith([listedPublished]));
    await screen.findByRole("article", { name: published.title });

    await user.click(
      card(published.title).getByRole("button", { name: "Encerrar" }),
    );
    await user.click(await screen.findByRole("button", { name: "Cancelar" }));

    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(statusRequests()).toHaveLength(0);
    expect(card(published.title).getByText("Aberta")).toBeInTheDocument();
  });

  it("shows why a closing was refused, inside the confirmation", async () => {
    const user = mount({
      "GET /jobs/me": { status: 200, data: [listedPublished] },
      [`PATCH /jobs/${published.id}/status`]: {
        status: 409,
        data: {
          title: "Conflict",
          status: 409,
          code: "job_already_closed",
          detail: "English text",
        },
      },
    });
    await screen.findByRole("article", { name: published.title });

    await user.click(
      card(published.title).getByRole("button", { name: "Encerrar" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Encerrar vaga" }),
    );

    expect(
      await screen.findByText(
        "Essa vaga já estava encerrada. A lista foi atualizada.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.queryByText("English text")).not.toBeInTheDocument();
    await waitFor(() => expect(listRequests()).toHaveLength(2));
  });

  it("reopens a closed job still within its closing date right away", async () => {
    const user = mount(serverWith([listedClosed]));
    await screen.findByRole("article", { name: listedClosed.title });

    await user.click(
      card(listedClosed.title).getByRole("button", { name: "Reabrir" }),
    );

    expect(
      await screen.findByText(
        `A vaga “${listedClosed.title}” foi reaberta e voltou às buscas dos candidatos.`,
      ),
    ).toBeInTheDocument();
    expect(statusRequests().map((request) => request.body)).toEqual([
      { status: "open" },
    ]);
    await waitFor(() =>
      expect(card(listedClosed.title).getByText("Aberta")).toBeInTheDocument(),
    );
  });

  it("asks for a new closing date to reopen a job past its date", async () => {
    const user = mount(serverWith([listedPastItsDate]));
    await screen.findByRole("article", { name: listedPastItsDate.title });

    await user.click(
      card(listedPastItsDate.title).getByRole("button", { name: "Reabrir" }),
    );
    await screen.findByRole("dialog", { name: "Reabrir a vaga" });
    await user.click(screen.getByRole("button", { name: "Reabrir vaga" }));

    const newDate = screen.getByLabelText("Nova data de encerramento *");
    expect(newDate).toHaveAccessibleDescription(
      "Informe a nova data de encerramento.",
    );
    expect(statusRequests()).toHaveLength(0);

    await user.type(newDate, "2000-01-01");
    await user.click(screen.getByRole("button", { name: "Reabrir vaga" }));
    expect(newDate).toHaveAccessibleDescription(
      "A data de encerramento não pode estar no passado.",
    );
    expect(statusRequests()).toHaveLength(0);

    await user.clear(newDate);
    await user.type(newDate, "2099-06-30");
    await user.click(screen.getByRole("button", { name: "Reabrir vaga" }));

    expect(
      await screen.findByText(
        `A vaga “${listedPastItsDate.title}” foi reaberta e voltou às buscas dos candidatos.`,
      ),
    ).toBeInTheDocument();
    expect(statusRequests().map((request) => request.body)).toEqual([
      { status: "open", closing_date: "2099-06-30" },
    ]);
    await waitFor(() =>
      expect(
        card(listedPastItsDate.title).getByText(
          "Remoto · Encerra em 30/06/2099 · Nenhuma candidatura ainda",
        ),
      ).toBeInTheDocument(),
    );
  });

  it("shows a refused reopening next to the job", async () => {
    const user = mount({
      "GET /jobs/me": { status: 200, data: [listedClosed] },
      [`PATCH /jobs/${listedClosed.id}/status`]: { status: 0 },
    });
    await screen.findByRole("article", { name: listedClosed.title });

    await user.click(
      card(listedClosed.title).getByRole("button", { name: "Reabrir" }),
    );

    expect(
      await card(listedClosed.title).findByText(
        "Não foi possível reabrir a vaga. Tente novamente.",
      ),
    ).toBeInTheDocument();
  });

  it("edits a job through the modal and shows the change in the list", async () => {
    let stored: ListedJob = { ...listedPublished };
    const user = mount({
      "GET /jobs/me": () => ({ status: 200, data: [stored] }),
      [`PATCH /jobs/${published.id}`]: (request) => {
        const body = request.body as {
          title: string;
          description: string;
          skills: { name: string }[];
        };
        stored = {
          ...stored,
          title: body.title,
          description: body.description,
          skills: stored.skills.filter((skill) =>
            body.skills.some(({ name }) => name === skill.name),
          ),
        };
        return { status: 200, data: stored };
      },
    });
    await screen.findByRole("article", { name: published.title });

    await user.click(
      card(published.title).getByRole("button", { name: "Editar" }),
    );
    const title = await screen.findByLabelText("Título da vaga *");
    expect(title).toHaveValue(published.title);
    await user.clear(title);
    await user.type(title, "Desenvolvedor(a) Frontend Sênior");
    await user.click(
      screen.getByRole("button", { name: "Remover habilidade Comunicação" }),
    );
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(
      await screen.findByText(
        "A vaga “Desenvolvedor(a) Frontend Sênior” foi atualizada.",
      ),
    ).toBeInTheDocument();
    const updated = await screen.findByRole("article", {
      name: "Desenvolvedor(a) Frontend Sênior",
    });
    expect(within(updated).queryByText("Comunicação")).not.toBeInTheDocument();
    expect(within(updated).getByText("React")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Editar vaga" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the edit modal and its message for a job gone from the server, then refreshes the list", async () => {
    let listed: ListedJob[] = [listedPublished];
    const user = mount({
      "GET /jobs/me": () => ({ status: 200, data: listed }),
      [`PATCH /jobs/${published.id}`]: () => {
        listed = [];
        return {
          status: 404,
          data: {
            title: "Not Found",
            status: 404,
            code: "job_not_found",
            detail: "English text",
          },
        };
      },
    });
    await screen.findByRole("article", { name: published.title });

    await user.click(
      card(published.title).getByRole("button", { name: "Editar" }),
    );
    await user.click(await screen.findByRole("button", { name: "Salvar" }));

    expect(
      await screen.findByText(
        "Não encontramos essa vaga. Feche esta janela e confira a lista de vagas.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Editar vaga" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(
      await screen.findByText(/Você ainda não publicou vagas/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Editar vaga" }),
    ).not.toBeInTheDocument();
  });

  it("closes a job from the edit modal only after the confirmation", async () => {
    const user = mount(serverWith([listedPublished]));
    await screen.findByRole("article", { name: published.title });

    await user.click(
      card(published.title).getByRole("button", { name: "Editar" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Encerrar vaga" }),
    );

    const confirmation = await screen.findByRole("alertdialog", {
      name: "Encerrar a vaga?",
    });
    expect(
      screen.queryByRole("heading", { name: "Editar vaga" }),
    ).not.toBeInTheDocument();
    expect(statusRequests()).toHaveLength(0);

    await user.click(
      within(confirmation).getByRole("button", { name: "Encerrar vaga" }),
    );

    expect(
      await screen.findByText(
        `A vaga “${published.title}” foi encerrada e saiu das buscas dos candidatos.`,
      ),
    ).toBeInTheDocument();
    expect(statusRequests().map((request) => request.body)).toEqual([
      { status: "closed" },
    ]);
  });

  it("does not offer to close a job that is not open from the edit modal", async () => {
    const user = mount({
      "GET /jobs/me": { status: 200, data: [listedClosed] },
    });
    await screen.findByRole("article", { name: listedClosed.title });

    await user.click(
      card(listedClosed.title).getByRole("button", { name: "Editar" }),
    );

    await screen.findByRole("heading", { name: "Editar vaga" });
    expect(
      screen.queryByRole("button", { name: "Encerrar vaga" }),
    ).not.toBeInTheDocument();
  });

  it("shows a job published in the modal in the list, once the API confirmed it", async () => {
    const stored: unknown[] = [];
    const user = mount({
      "GET /jobs/me": () => ({ status: 200, data: [...stored] }),
      "POST /jobs": () => {
        stored.push({ ...published, application_count: 0 });
        return { status: 201, data: published };
      },
    });
    await screen.findByText(EMPTY_STATE);

    await publishThroughTheModal(user);

    const card = await screen.findByRole("article", { name: published.title });
    expect(within(card).getByText("Comunicação")).toBeInTheDocument();
    expect(screen.queryByText(EMPTY_STATE)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Cadastrar nova vaga" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        `A vaga “${published.title}” foi publicada e já aparece na lista.`,
      ),
    ).toBeInTheDocument();
    expect(
      stub?.requests.find((request) => request.method === "post")?.body,
    ).toMatchObject({
      skills: [
        { name: "React", type: "hard" },
        { name: "Comunicação", type: "soft" },
      ],
    });
  });

  it("leaves the list as the server has it when publishing fails", async () => {
    const user = mount({
      "GET /jobs/me": { status: 200, data: [] },
      "POST /jobs": {
        status: 500,
        data: {
          title: "Internal Server Error",
          status: 500,
          code: "internal_error",
        },
      },
    });
    await screen.findByText(EMPTY_STATE);

    await publishThroughTheModal(user);

    expect(
      await screen.findByText(
        "Não foi possível publicar a vaga. Seus dados foram mantidos; tente novamente.",
      ),
    ).toBeInTheDocument();
    await waitFor(() => expect(listRequests()).toHaveLength(2));
    expect(screen.getByText(EMPTY_STATE)).toBeInTheDocument();
    expect(screen.queryByText("Sucesso")).not.toBeInTheDocument();
  });

  it("offers a retry when the list cannot be loaded", async () => {
    let attempts = 0;
    const user = mount({
      "GET /jobs/me": () => {
        attempts += 1;
        return attempts === 1
          ? { status: 0 }
          : { status: 200, data: [listedPublished] };
      },
    });

    expect(
      await screen.findByText(
        "Não foi possível carregar suas vagas. Tente novamente.",
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));

    expect(
      await screen.findByRole("article", { name: published.title }),
    ).toBeInTheDocument();
  });

  it("tells a company awaiting approval why it cannot publish yet", async () => {
    mount({
      "GET /jobs/me": {
        status: 403,
        data: {
          title: "Forbidden",
          status: 403,
          code: "approved_company_required",
        },
      },
    });

    expect(
      await screen.findByText(/ainda não foi aprovada/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Cadastrar nova vaga" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Tentar novamente" }),
    ).not.toBeInTheDocument();
  });
});
