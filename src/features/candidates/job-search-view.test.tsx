import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import {
  cleanup,
  render as renderComponent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "@/lib/api-client";

import { jobDetail } from "../../../tests/job-detail-fixture";

import { JobSearchView } from "./job-search-view";

vi.mock("@/lib/api-client", () => ({
  apiClient: { get: vi.fn() },
}));

const baseJob = {
  id: jobDetail.id,
  title: "Supervisor de Logística",
  company_name: "Move Distribuição",
  location: "São Paulo, SP",
  work_mode: "onsite" as const,
  salary_max: 8000,
  published_at: "2026-09-25T12:00:00Z",
  days_since_published: 3,
  matched_skill_count: 3,
  required_skill_count: 4,
  missing_skills: [
    { id: "s1", name: "certificação NR-11", type: "hard" as const },
  ],
};

function render(element: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderComponent(
    <QueryClientProvider client={client}>{element}</QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("JobSearchView", () => {
  it("shows the results counter and job cards after loading", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValueOnce({ data: [baseJob] });

    render(<JobSearchView />);

    expect(await screen.findByText("Supervisor de Logística")).toBeVisible();
    expect(
      screen.getByText((_, element) => {
        return element?.textContent === "1 vaga encontrada";
      }),
    ).toBeVisible();
    expect(
      screen.getByText(
        /São Paulo, SP.*Presencial.*Até R\$\s?8\.000.*há 3 dias/,
      ),
    ).toBeVisible();
    expect(screen.getByText(/Falta certificação NR-11/)).toBeVisible();
  });

  it("shows a clear empty state when nothing matches", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValueOnce({ data: [] });

    render(<JobSearchView />);

    expect(
      await screen.findByText((_, element) => {
        return element?.textContent === "0 vagas encontradas";
      }),
    ).toBeVisible();
    expect(screen.getByText("Nenhuma vaga encontrada.")).toBeVisible();
  });

  it("shows an error state with a retry button on failure", async () => {
    vi.spyOn(apiClient, "get").mockRejectedValueOnce(new Error("network"));

    render(<JobSearchView />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar as vagas.",
    );
    expect(
      screen.getByRole("button", { name: /tentar novamente/i }),
    ).toBeVisible();
  });

  it("debounces the search term before calling the API again", async () => {
    const get = vi
      .spyOn(apiClient, "get")
      .mockResolvedValue({ data: [baseJob] });
    const user = userEvent.setup();

    render(<JobSearchView />);
    await screen.findByText("Supervisor de Logística");
    get.mockClear();

    await user.type(screen.getByLabelText(/buscar por vaga/i), "supervisor");

    // Ainda dentro do debounce: não deve ter chamado de novo pra cada tecla.
    expect(get).not.toHaveBeenCalled();

    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    expect(get).toHaveBeenCalledWith(
      expect.stringContaining("search=supervisor"),
      expect.anything(),
    );
  });

  it("pluralizes the missing-skills message for more than one skill", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValueOnce({
      data: [
        {
          ...baseJob,
          missing_skills: [
            { id: "s1", name: "WMS", type: "hard" as const },
            { id: "s2", name: "inglês básico", type: "soft" as const },
          ],
        },
      ],
    });

    render(<JobSearchView />);

    expect(await screen.findByText(/Faltam.*WMS.*inglês básico/)).toBeVisible();
  });

  it("opens the vacancy detail from Ver vaga", async () => {
    const get = vi
      .spyOn(apiClient, "get")
      .mockResolvedValueOnce({ data: [baseJob] })
      .mockResolvedValueOnce({ data: { ...jobDetail, title: baseJob.title } });
    const user = userEvent.setup();

    render(<JobSearchView />);
    await screen.findByRole("heading", { name: "Supervisor de Logística" });

    const opener = screen.getByRole("button", {
      name: "Ver vaga Supervisor de Logística",
    });
    await user.click(opener);

    const dialog = await screen.findByRole("dialog");
    expect(
      await within(dialog).findByRole("heading", {
        name: "Supervisor de Logística",
      }),
    ).toBeVisible();
    expect(
      within(dialog).getByText("Você atende 3 de 4 requisitos"),
    ).toBeVisible();
    expect(
      within(dialog).getByText(/Habilidades em falta: certificação NR-11/),
    ).toBeVisible();
    expect(
      within(dialog).getByRole("button", { name: "Candidatar-se" }),
    ).toBeEnabled();
    expect(
      within(dialog).getByRole("heading", { name: "Descrição da vaga" }),
    ).toBeVisible();
    expect(within(dialog).getByText(jobDetail.description)).toBeVisible();
    expect(get.mock.calls[1]?.[0]).toBe(`/jobs/${jobDetail.id}`);
    expect(get.mock.calls[1]?.[1]?.signal).toBeInstanceOf(AbortSignal);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(opener).toHaveFocus());
  });
});
