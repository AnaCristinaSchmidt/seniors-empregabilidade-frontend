import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterContextProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach, vi } from "vitest";
import React from "react";

import { apiClient } from "@/lib/api-client";
import ApplicationsPage from "./applications";
import * as applicationsApi from "./applications-schema";

const mockApplications = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    job_id: "22222222-2222-4222-8222-222222222222",
    job_title: "Analista Administrativo",
    company_name: "LogiBrás",
    submitted_at: "2026-08-04T12:00:00.000Z",
    days_in_process: 15,
    status: "under_review" as const,
    similar_jobs: [],
  },
  {
    id: "33333333-3333-3333-3333-333333333333",
    job_id: "44444444-4444-4444-4444-444444444444",
    job_title: "Coordenador de Projetos",
    company_name: "Vitalis",
    submitted_at: "2026-08-12T12:00:00.000Z",
    days_in_process: 0,
    status: "not_selected" as const,
    similar_jobs: [
      {
        id: "55555555-5555-5555-5555-555555555555",
        title: "Gerente de Projetos",
        company_name: "TechCorp",
      },
      {
        id: "66666666-6666-6666-6666-666666666666",
        title: "Coordenador de Projetos",
        company_name: "Outra Empresa",
      },
      {
        id: "77777777-7777-7777-7777-777777777777",
        title: "Analista de Projetos",
        company_name: "Empresa Exemplo",
      },
    ],
  },
  {
    id: "88888888-8888-8888-8888-888888888888",
    job_id: "99999999-9999-9999-9999-999999999999",
    job_title: "Gerente de Operações",
    company_name: "TechCorp",
    submitted_at: "2026-08-10T12:00:00.000Z",
    days_in_process: 10,
    status: "applied" as const,
    similar_jobs: [],
  },
];

const renderWithClient = (ui: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  const router = createRouter({
    routeTree: createRootRoute(),
    history: createMemoryHistory({
      initialEntries: ["/candidato/candidaturas"],
    }),
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterContextProvider router={router}>{ui}</RouterContextProvider>
    </QueryClientProvider>,
  );
};

describe("ApplicationsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(applicationsApi, "fetchApplications").mockImplementation(
      ({ companyName } = {}) => {
        if (!companyName) {
          return Promise.resolve(mockApplications);
        }

        return Promise.resolve(
          mockApplications.filter((application) =>
            application.company_name
              .toLowerCase()
              .includes(companyName.toLowerCase()),
          ),
        );
      },
    );
  });

  it("must display the loading state while applications are being fetched.", () => {
    vi.spyOn(applicationsApi, "fetchApplications").mockImplementation(
      () => new Promise(() => {}),
    );

    renderWithClient(<ApplicationsPage />);

    expect(
      screen.getByRole("heading", { name: "Candidaturas" }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("status", {
        name: /Carregando candidaturas/i,
      }),
    ).toBeInTheDocument();
  });

  it("must display an error message when loading applications fails", async () => {
    vi.spyOn(applicationsApi, "fetchApplications").mockRejectedValue(
      new Error("Network Error"),
    );

    renderWithClient(<ApplicationsPage />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        /Ocorreu um erro ao carregar suas candidaturas. Tente novamente mais tarde./i,
      );
    });
  });

  it("must list the successfully received applications", async () => {
    renderWithClient(<ApplicationsPage />);
    expect(
      await screen.findByText(/Analista Administrativo · LogiBrás/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Enviada em 4 de agosto · 15 dias em processo/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Em análise/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Coordenador de Projetos · Vitalis/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Você não foi selecionado/i)).toBeInTheDocument();
    expect(
      screen.getByText("3 vagas parecidas", { exact: true }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Enviada em 12 de agosto. A candidatura foi encerrada./i,
      ),
    ).toBeInTheDocument();
  });

  it.each([
    {
      status: "in_selection_process" as const,
      label: "Em processo seletivo",
      description: "Enviada em 4 de agosto · 15 dias em processo.",
      withdrawButtons: 1,
    },
    {
      status: "hired" as const,
      label: "Você foi selecionado",
      description:
        "Enviada em 4 de agosto. A empresa selecionou você para a oportunidade.",
      withdrawButtons: 0,
    },
    {
      status: "withdrawn" as const,
      label: "Você saiu do processo seletivo",
      description:
        "Enviada em 4 de agosto. Você optou por sair deste processo seletivo.",
      withdrawButtons: 0,
    },
    {
      status: "expired" as const,
      label: "Candidatura expirada",
      description:
        "Enviada em 4 de agosto. Esta candidatura não está mais ativa.",
      withdrawButtons: 0,
    },
  ])(
    "must describe a $status application and offer withdrawal only while it is active",
    async ({ status, label, description, withdrawButtons }) => {
      vi.spyOn(applicationsApi, "fetchApplications").mockResolvedValue([
        { ...mockApplications[0]!, status },
      ]);

      renderWithClient(<ApplicationsPage />);

      const card = await screen.findByRole("article", {
        name: "Analista Administrativo · LogiBrás",
      });
      expect(within(card).getByText(label, { exact: true })).toBeVisible();
      expect(within(card).getByText(description)).toBeVisible();
      expect(
        within(card).queryByText("Você não foi selecionado"),
      ).not.toBeInTheDocument();
      expect(
        within(card).queryByRole("button", { name: "Ver vagas parecidas" }),
      ).not.toBeInTheDocument();
      expect(
        within(card).queryAllByRole("button", { name: "Sair do processo" }),
      ).toHaveLength(withdrawButtons);
      expect(
        within(card).queryAllByRole("link", { name: /Ver a vaga/ }),
      ).toHaveLength(withdrawButtons);
    },
  );

  it("must filter the list of applications based on the company search", async () => {
    const user = userEvent.setup();

    renderWithClient(<ApplicationsPage />);

    expect(
      await screen.findByText(/Analista Administrativo · LogiBrás/i),
    ).toBeInTheDocument();

    const searchInput = screen.getByRole("textbox", {
      name: /Buscar por nome da empresa/i,
    });

    await user.type(searchInput, "Tech");
    await waitFor(() => {
      expect(
        screen.getByText(/Gerente de Operações · TechCorp/i),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByText(/Analista Administrativo · LogiBrás/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Coordenador de Projetos · Vitalis/i),
    ).not.toBeInTheDocument();
  });

  it("must show the message of empty list if the search don't find any results", async () => {
    const user = userEvent.setup();

    renderWithClient(<ApplicationsPage />);

    await waitFor(() => {
      expect(
        screen.getByText(/Analista Administrativo · LogiBrás/i),
      ).toBeInTheDocument();
    });

    const searchInput = screen.getByRole("textbox", {
      name: /Buscar por nome da empresa/i,
    });

    await user.type(searchInput, "NonExistentCompany");

    await waitFor(() => {
      expect(
        screen.getByText(/Nenhuma candidatura encontrada./i),
      ).toBeInTheDocument();
    });
  });

  it("must display a validation error without requesting a search over 200 characters", async () => {
    const user = userEvent.setup();
    renderWithClient(<ApplicationsPage />);

    const searchInput = screen.getByRole("textbox", {
      name: /Buscar por nome da empresa/i,
    });

    await user.click(searchInput);
    await user.paste("a".repeat(201));

    await waitFor(() => {
      expect(
        screen.getByText(
          /O nome da empresa deve ter no máximo 200 caracteres./i,
        ),
      ).toBeInTheDocument();
    });

    expect(searchInput).toHaveAttribute("aria-invalid", "true");
    expect(searchInput).toHaveAttribute("aria-describedby", "search-error");
    expect(
      vi
        .mocked(applicationsApi.fetchApplications)
        .mock.calls.every(
          ([params]) =>
            !params?.companyName || params.companyName.length <= 200,
        ),
    ).toBe(true);
  });

  it("must open the withdrawal confirmation dialog and allow cancellation", async () => {
    const user = userEvent.setup();

    renderWithClient(<ApplicationsPage />);

    await waitFor(() => {
      expect(
        screen.getByText(/Analista Administrativo · LogiBrás/i),
      ).toBeInTheDocument();
    });

    const quitButton = screen.getAllByRole("button", {
      name: /Sair do processo/i,
    });
    await user.click(quitButton[0]!);

    expect(
      screen.getByRole("heading", { name: /Você tem certeza\?/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Essa ação não pode ser desfeita. Você será removido do processo seletivo./i,
      ),
    ).toBeInTheDocument();

    const cancelButton = screen.getByRole("button", { name: /Cancelar/i });
    await user.click(cancelButton);

    await waitFor(() => {
      expect(
        screen.queryByRole("heading", {
          name: /Você tem certeza?/i,
        }),
      ).not.toBeInTheDocument();
    });
    await waitFor(() => expect(quitButton[0]).toHaveFocus());
  });

  it("must return focus to the opening button when the dialog is dismissed with Escape", async () => {
    const user = userEvent.setup();
    renderWithClient(<ApplicationsPage />);

    const [quitButton] = await screen.findAllByRole("button", {
      name: "Sair do processo",
    });
    await user.click(quitButton!);
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(quitButton).toHaveFocus());
  });

  it("must submit the withdrawal confirmation", async () => {
    const user = userEvent.setup();

    const postSpy = vi.spyOn(apiClient, "post").mockResolvedValue({
      data: { ...mockApplications[0], status: "withdrawn" },
    });
    renderWithClient(<ApplicationsPage />);
    await waitFor(() => {
      expect(
        screen.getByText(/Analista Administrativo · LogiBrás/i),
      ).toBeInTheDocument();
    });

    const quitButton = screen.getAllByRole("button", {
      name: /Sair do processo/i,
    });
    await user.click(quitButton[0]!);

    const dialog = screen.getByRole("alertdialog");

    const confirmButton = within(dialog).getByRole("button", {
      name: /Sair do processo/i,
    });

    await user.click(confirmButton);

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith(
        "/applications/11111111-1111-4111-8111-111111111111/withdraw",
      );
    });

    await waitFor(() => {
      expect(
        screen.queryByRole("heading", {
          name: /Você tem certeza\?/i,
        }),
      ).not.toBeInTheDocument();
    });
  });

  it("must keep the withdrawal dialog open and show an error when withdrawal fails", async () => {
    const user = userEvent.setup();

    const postSpy = vi
      .spyOn(apiClient, "post")
      .mockRejectedValue(new Error("Network Error"));

    renderWithClient(<ApplicationsPage />);

    await waitFor(() => {
      expect(
        screen.getByText(/Analista Administrativo · LogiBrás/i),
      ).toBeInTheDocument();
    });

    const quitButton = screen.getAllByRole("button", {
      name: /Sair do processo/i,
    });

    await user.click(quitButton[0]!);

    const dialog = screen.getByRole("alertdialog");

    const confirmButton = within(dialog).getByRole("button", {
      name: /Sair do processo/i,
    });

    await user.click(confirmButton);

    expect(postSpy).toHaveBeenCalledWith(
      "/applications/11111111-1111-4111-8111-111111111111/withdraw",
    );

    expect(
      await within(dialog).findByText(
        /Não foi possível confirmar a saída do processo seletivo/i,
      ),
    ).toBeInTheDocument();

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();

    const cancelButton = within(dialog).getByRole("button", {
      name: /Cancelar/i,
    });

    expect(cancelButton).toBeEnabled();
  });

  it("must keep the dialog open and disable cancellation while withdrawal is pending", async () => {
    const user = userEvent.setup();

    let resolvePost!: () => void;

    const postSpy = vi.spyOn(apiClient, "post").mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePost = () =>
            resolve({ data: { ...mockApplications[0], status: "withdrawn" } });
        }),
    );

    renderWithClient(<ApplicationsPage />);

    await waitFor(() => {
      expect(
        screen.getByText(/Analista Administrativo · LogiBrás/i),
      ).toBeInTheDocument();
    });

    const quitButton = screen.getAllByRole("button", {
      name: /Sair do processo/i,
    });

    await user.click(quitButton[0]!);

    const dialog = screen.getByRole("alertdialog");

    const confirmButton = within(dialog).getByRole("button", {
      name: /Sair do processo/i,
    });

    await user.click(confirmButton);

    expect(postSpy).toHaveBeenCalledWith(
      "/applications/11111111-1111-4111-8111-111111111111/withdraw",
    );

    expect(
      within(dialog).getByRole("button", { name: /Cancelar/i }),
    ).toBeDisabled();

    expect(dialog).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();

    resolvePost();

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
  });

  it("clears a previous failure before opening another application", async () => {
    const user = userEvent.setup();
    const post = vi
      .spyOn(apiClient, "post")
      .mockRejectedValue(new Error("Network"));
    renderWithClient(<ApplicationsPage />);
    const buttons = await screen.findAllByRole("button", {
      name: "Sair do processo",
    });
    await user.click(buttons[0]!);
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Sair do processo",
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível confirmar",
    );
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    await user.click(
      screen.getAllByRole("button", { name: "Sair do processo" })[1]!,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("reveals real similar job titles and companies only for a rejected application", async () => {
    const user = userEvent.setup();
    renderWithClient(<ApplicationsPage />);
    const button = await screen.findByRole("button", {
      name: "Ver vagas parecidas",
    });
    expect(button).toHaveAttribute("aria-expanded", "false");
    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    const card = screen.getByRole("article", {
      name: "Coordenador de Projetos · Vitalis",
    });
    expect(within(card).getByText("Gerente de Projetos")).toBeVisible();
    expect(within(card).getByText("TechCorp")).toBeVisible();
  });

  it("links Ver a vaga to the job detail route while the application is active", async () => {
    renderWithClient(<ApplicationsPage />);

    const active = await screen.findByRole("article", {
      name: "Analista Administrativo · LogiBrás",
    });
    expect(
      within(active).getByRole("link", { name: /Ver a vaga/ }),
    ).toHaveAttribute(
      "href",
      "/candidato/vagas/22222222-2222-4222-8222-222222222222",
    );

    const rejected = screen.getByRole("article", {
      name: "Coordenador de Projetos · Vitalis",
    });
    expect(
      within(rejected).queryByRole("link", { name: /Ver a vaga/ }),
    ).not.toBeInTheDocument();
  });
});
