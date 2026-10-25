import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "@/lib/api-client";
import { ApiError } from "@/lib/api-error";

import type { Skill } from "./professional-profile-schema";
import { SkillSelection } from "./skill-selection";

vi.mock("@/lib/api-client", () => ({
  apiClient: { get: vi.fn() },
}));

const leadership: Skill = { id: "s1", name: "Liderança", type: "soft" };
const negotiation: Skill = { id: "s2", name: "Negociação", type: "soft" };
const advancedNegotiation: Skill = {
  id: "s3",
  name: "Negociação avançada",
  type: "soft",
};
const excel: Skill = { id: "s4", name: "Excel", type: "hard" };
const catalog = [excel, leadership, negotiation, advancedNegotiation];

// Answers like GET /skills: a blank search lists the catalog, otherwise the
// names containing the search, ignoring case and accents.
function comparable(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function mockCatalog(skills: Skill[] = catalog) {
  return vi
    .spyOn(apiClient, "get")
    .mockImplementation((_url: string, config?: { params?: unknown }) => {
      const { search } = config?.params as { search: string };
      return Promise.resolve({
        data: skills.filter((skill) =>
          comparable(skill.name).includes(comparable(search)),
        ),
      });
    });
}

function Harness({
  initial = [],
  disabled = false,
  onChange = vi.fn(),
  onSubmit = vi.fn(),
}: {
  initial?: Skill[];
  disabled?: boolean;
  onChange?: (skills: Skill[]) => void;
  onSubmit?: () => void;
}) {
  const [selected, setSelected] = useState(initial);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <SkillSelection
        selected={selected}
        disabled={disabled}
        onChange={(skills) => {
          setSelected(skills);
          onChange(skills);
        }}
      />
    </form>
  );
}

function renderSelection(props: Parameters<typeof Harness>[0] = {}) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <Harness {...props} />
    </QueryClientProvider>,
  );
}

async function findCatalog() {
  return screen.findByRole("list", { name: "Catálogo de habilidades" });
}

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("SkillSelection", () => {
  it("lists the catalog before anything is typed and marks the selected skills", async () => {
    const get = mockCatalog();

    renderSelection({ initial: [leadership] });

    const list = await findCatalog();
    expect(get).toHaveBeenCalledWith(
      "/skills",
      expect.objectContaining({ params: { search: "", limit: 20 } }),
    );
    expect(
      within(list).getByRole("button", { name: "Liderança" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      within(list).getByRole("button", { name: "Negociação" }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(
      within(screen.getByRole("list", { name: "Selecionadas (1)" })).getByText(
        "Liderança",
      ),
    ).toBeVisible();
  });

  it("selects several skills and lets each one go from the catalog or its chip", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    mockCatalog();

    renderSelection({ initial: [leadership], onChange });

    const list = await findCatalog();
    await user.click(within(list).getByRole("button", { name: "Negociação" }));
    await user.click(within(list).getByRole("button", { name: "Excel" }));

    expect(onChange).toHaveBeenLastCalledWith([leadership, negotiation, excel]);
    expect(
      screen.getByRole("list", { name: "Selecionadas (3)" }),
    ).toBeVisible();
    expect(within(list).getByRole("button", { name: "Excel" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await user.click(within(list).getByRole("button", { name: "Negociação" }));
    await user.click(
      screen.getByRole("button", { name: "Remover habilidade Excel" }),
    );

    expect(onChange).toHaveBeenLastCalledWith([leadership]);
    expect(within(list).getByRole("button", { name: "Excel" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("says when no skill is selected yet", async () => {
    mockCatalog();

    renderSelection();

    await findCatalog();
    expect(screen.getByText("Selecionadas (0)")).toBeVisible();
    expect(
      screen.getByText("Nenhuma habilidade selecionada ainda."),
    ).toBeVisible();
  });

  it("filters the catalog by the typed text, ignoring accents", async () => {
    const user = userEvent.setup();
    const get = mockCatalog();

    renderSelection();

    await findCatalog();
    await user.type(screen.getByLabelText("Buscar no catálogo"), "negociacao");

    expect(await screen.findByText("2 habilidades encontradas.")).toBeVisible();
    expect(get).toHaveBeenLastCalledWith(
      "/skills",
      expect.objectContaining({
        params: { search: "negociacao", limit: 20 },
      }),
    );
    const list = screen.getByRole("list", { name: "Catálogo de habilidades" });
    expect(within(list).getAllByRole("button")).toHaveLength(2);
  });

  it("says when no catalog skill matches the search", async () => {
    const user = userEvent.setup();
    mockCatalog();

    renderSelection();

    await findCatalog();
    await user.type(screen.getByLabelText("Buscar no catálogo"), "xyz");

    expect(
      await screen.findByText(
        "Nenhuma habilidade encontrada para “xyz”. Tente outra palavra.",
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole("list", { name: "Catálogo de habilidades" }),
    ).not.toBeInTheDocument();
  });

  it("says when the catalog is empty", async () => {
    mockCatalog([]);

    renderSelection();

    expect(
      await screen.findByText("O catálogo de habilidades ainda está vazio."),
    ).toBeVisible();
  });

  it("shows the catalog loading", () => {
    vi.spyOn(apiClient, "get").mockReturnValue(new Promise(() => {}));

    renderSelection();

    expect(screen.getByRole("status")).toHaveTextContent(
      "Carregando o catálogo de habilidades...",
    );
  });

  it("explains a catalog failure and loads it again on request", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, "get")
      .mockRejectedValueOnce(new ApiError({ message: "Network Error" }))
      .mockResolvedValueOnce({ data: [excel] });

    renderSelection();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar o catálogo de habilidades.",
    );
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));

    const list = await findCatalog();
    expect(within(list).getByRole("button", { name: "Excel" })).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("invites a narrower search when the catalog has more skills than shown", async () => {
    mockCatalog(
      Array.from({ length: 20 }, (_, index) => ({
        id: `bulk-${index}`,
        name: `Habilidade ${index + 1}`,
        type: "hard" as const,
      })),
    );

    renderSelection();

    expect(
      await screen.findByText(
        "Mostrando as primeiras 20 habilidades. Digite parte do nome para encontrar outras.",
      ),
    ).toBeVisible();
  });

  describe("Enter in the search", () => {
    it("selects the skill named as typed instead of submitting the form", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      mockCatalog();

      renderSelection({ onSubmit });

      await findCatalog();
      const input = screen.getByLabelText("Buscar no catálogo");
      await user.type(input, "negociacao");
      await screen.findByText("2 habilidades encontradas.");
      await user.type(input, "{Enter}");

      expect(
        screen.getByRole("button", { name: "Remover habilidade Negociação" }),
      ).toBeVisible();
      expect(input).toHaveValue("");
      expect(screen.getByRole("status")).toHaveTextContent(
        "Negociação selecionada.",
      );
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("selects the only skill the search found", async () => {
      const user = userEvent.setup();
      mockCatalog();

      renderSelection();

      await findCatalog();
      const input = screen.getByLabelText("Buscar no catálogo");
      await user.type(input, "exc");
      await screen.findByText("1 habilidade encontrada.");
      await user.type(input, "{Enter}");

      expect(
        screen.getByRole("button", { name: "Remover habilidade Excel" }),
      ).toBeVisible();
    });

    it("says when the typed skill is already selected", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      mockCatalog();

      renderSelection({ initial: [leadership], onChange });

      await findCatalog();
      await user.type(
        screen.getByLabelText("Buscar no catálogo"),
        "lideranca{Enter}",
      );

      await waitFor(() =>
        expect(screen.getByRole("status")).toHaveTextContent(
          "Liderança já está entre as selecionadas.",
        ),
      );
      expect(onChange).not.toHaveBeenCalled();
    });

    it("asks to pick from the list when the text names no single skill", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      const onChange = vi.fn();
      mockCatalog();

      renderSelection({ onChange, onSubmit });

      await findCatalog();
      const input = screen.getByLabelText("Buscar no catálogo");
      await user.type(input, "{Enter}");
      expect(screen.getByRole("status")).toBeEmptyDOMElement();

      await user.type(input, "neg");
      await screen.findByText("2 habilidades encontradas.");
      await user.type(input, "{Enter}");

      expect(screen.getByRole("status")).toHaveTextContent(
        "Escolha uma das habilidades da lista do catálogo.",
      );
      expect(onChange).not.toHaveBeenCalled();
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  it("locks the selection while the résumé is being saved", async () => {
    mockCatalog();

    renderSelection({ initial: [leadership], disabled: true });

    const list = await findCatalog();
    for (const button of within(list).getAllByRole("button")) {
      expect(button).toBeDisabled();
    }
    expect(
      screen.getByRole("button", { name: "Remover habilidade Liderança" }),
    ).toBeDisabled();
    expect(screen.getByLabelText("Buscar no catálogo")).toBeDisabled();
  });

  it("allows removing at the 100-skill limit before selecting another", async () => {
    const user = userEvent.setup();
    const initial: Skill[] = Array.from({ length: 100 }, (_, index) => ({
      id: `existing-${index}`,
      name: `Habilidade ${index}`,
      type: "soft",
    }));
    const onChange = vi.fn();
    const get = mockCatalog();
    renderSelection({ initial, onChange });
    const list = await findCatalog();
    expect(within(list).getByRole("button", { name: "Excel" })).toBeDisabled();
    await user.type(screen.getByLabelText("Buscar no catálogo"), "excel");
    await waitFor(() =>
      expect(get).toHaveBeenLastCalledWith(
        "/skills",
        expect.objectContaining({ params: { search: "excel", limit: 20 } }),
      ),
    );
    await user.keyboard("{Enter}");
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("até 100 habilidades");
    await user.click(
      screen.getByRole("button", { name: "Remover habilidade Habilidade 0" }),
    );
    await user.click(within(list).getByRole("button", { name: "Excel" }));
    expect(onChange).toHaveBeenLastCalledWith(expect.arrayContaining([excel]));
    expect(screen.getByText("Selecionadas (100)")).toBeVisible();
  });
});
