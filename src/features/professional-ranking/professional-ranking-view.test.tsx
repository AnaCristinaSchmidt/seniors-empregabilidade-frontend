import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProfessionalRankingView } from "./professional-ranking-view";

const getMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api-client", () => ({
  apiClient: { get: getMock },
}));

function applicant(
  id: string,
  fullName: string,
  percentage: number | string | null,
  matched: number,
  required: number,
  city: string | null = "Porto Alegre",
  state: string | null = "RS",
  origin: "application" | "automatic_match" = "application",
) {
  const automatic = origin === "automatic_match";

  return {
    origin,
    application_id: automatic ? null : id,
    status: automatic ? null : "submitted",
    match_score: null,
    compatibility_percentage: percentage,
    is_highlighted: percentage !== null && Number(percentage) >= 50,
    matched_skill_count: matched,
    required_skill_count: required,
    profile: { candidate_id: `c-${id}`, full_name: fullName, city, state },
  };
}

// Fora de ordem de propósito: a tela precisa ordenar sozinha.
const PAYLOAD = {
  job_id: "job-1",
  total_applicant_count: 5,
  full_match_count: 1,
  automatic_match_count: 0,
  applicants: [
    applicant("a-5", "Antônio Ferraz", "20.00", 1, 5, null, null),
    applicant("a-2", "Camila Andrade Souza", "66.67", 4, 6),
    applicant("a-1", "Marcos Silveira", 100, 5, 5),
    applicant("a-4", "Helena Prado", "40.00", 2, 5),
    applicant("a-3", "Roberto Testes Silva", "50.00", 2, 4),
  ],
};

beforeEach(() => {
  getMock.mockReset();
  getMock.mockResolvedValue({ data: PAYLOAD });
});

function renderView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ProfessionalRankingView jobId="job-1" />
    </QueryClientProvider>,
  );
}

function bodyRows() {
  return screen.getAllByRole("row").slice(1);
}

describe("ProfessionalRankingView", () => {
  it("lista do maior para o menor percentual", async () => {
    renderView();

    await screen.findByText("Marcos Silveira");
    const names = bodyRows().map(
      (row) =>
        within(row).getAllByRole("cell")[0]?.querySelector("p.font-semibold")
          ?.textContent,
    );

    expect(names).toEqual([
      "Marcos Silveira",
      "Camila Andrade Souza",
      "Roberto Testes Silva",
      "Helena Prado",
      "Antônio Ferraz",
    ]);
  });

  it("destaca perfis a partir de 50% com texto, não só cor", async () => {
    renderView();

    await screen.findByText("Marcos Silveira");

    expect(screen.getAllByText("Em destaque")).toHaveLength(3);
    const rows = bodyRows();
    expect(rows[2]).toHaveAttribute("data-highlighted", "true");
    expect(rows[3]).toHaveAttribute("data-highlighted", "false");
  });

  it("mostra quantos requisitos foram atendidos e formata o percentual", async () => {
    renderView();

    const row = (await screen.findByText("Camila Andrade Souza")).closest(
      "tr",
    ) as HTMLElement;

    expect(within(row).getByText(/4 de 6 requisitos/)).toBeInTheDocument();
    expect(within(row).getByText(/66,67%/)).toBeInTheDocument();
  });

  it("mantém perfis abaixo de 50% acessíveis", async () => {
    renderView();

    const row = (await screen.findByText("Antônio Ferraz")).closest(
      "tr",
    ) as HTMLElement;

    expect(
      within(row).getByRole("button", { name: /Ver currículo/ }),
    ).toBeEnabled();
  });

  it("mostra a origem e aceita match automático sem candidatura", async () => {
    getMock.mockResolvedValue({
      data: {
        ...PAYLOAD,
        automatic_match_count: 1,
        applicants: [
          applicant("a-1", "Marcos Silveira", 100, 5, 5),
          applicant(
            "a-7",
            "Paula Auto",
            "60.00",
            3,
            5,
            "Canoas",
            "RS",
            "automatic_match",
          ),
        ],
      },
    });

    renderView();

    const auto = (await screen.findByText("Paula Auto")).closest(
      "tr",
    ) as HTMLElement;
    const applied = screen
      .getByText("Marcos Silveira")
      .closest("tr") as HTMLElement;

    expect(within(auto).getByText("Match automático")).toBeInTheDocument();
    expect(
      within(applied).getByText("Candidatou-se à vaga"),
    ).toBeInTheDocument();
    expect(
      within(auto).getByRole("button", { name: /Ver currículo/ }),
    ).toBeEnabled();
  });

  it("filtra a lista por origem e informa as quantidades", async () => {
    getMock.mockResolvedValue({
      data: {
        ...PAYLOAD,
        applicants: [
          applicant("a-1", "Marcos Silveira", 100, 5, 5),
          applicant(
            "a-7",
            "Paula Auto",
            "60.00",
            3,
            5,
            "Canoas",
            "RS",
            "automatic_match",
          ),
        ],
      },
    });
    const user = userEvent.setup();

    renderView();
    await screen.findByText("Marcos Silveira");

    await user.click(
      screen.getByRole("button", { name: "Matches automáticos (1)" }),
    );
    expect(screen.getByText("Paula Auto")).toBeInTheDocument();
    expect(screen.queryByText("Marcos Silveira")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Matches automáticos (1)" }),
    ).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Candidaturas (1)" }));
    expect(screen.getByText("Marcos Silveira")).toBeInTheDocument();
    expect(screen.queryByText("Paula Auto")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Todos (2)" }));
    expect(bodyRows()).toHaveLength(2);
  });

  it("não exibe contato nem dados sensíveis", async () => {
    renderView();
    await screen.findByText("Marcos Silveira");

    expect(screen.queryByText(/@/)).not.toBeInTheDocument();
    expect(screen.queryByText(/telefone|e-mail|cpf/i)).not.toBeInTheDocument();
  });

  it("chama o endpoint de candidaturas da vaga", async () => {
    renderView();

    await screen.findByText("Marcos Silveira");

    expect(getMock).toHaveBeenCalledWith(
      "/jobs/job-1/applications",
      expect.anything(),
    );
  });

  it("mostra aviso quando a vaga não tem requisitos", async () => {
    getMock.mockResolvedValue({
      data: {
        ...PAYLOAD,
        applicants: [applicant("a-9", "Sem Requisito", null, 0, 0)],
      },
    });

    renderView();

    expect(await screen.findByText(/Sem cálculo/)).toBeInTheDocument();
  });

  it("mostra erro e permite tentar novamente", async () => {
    getMock.mockRejectedValueOnce(new Error("falhou"));
    const user = userEvent.setup();

    renderView();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar os profissionais",
    );

    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));

    expect(await screen.findByText("Marcos Silveira")).toBeInTheDocument();
  });
});
