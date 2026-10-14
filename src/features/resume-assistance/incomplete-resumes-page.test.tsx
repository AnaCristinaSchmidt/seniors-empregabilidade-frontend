import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import {
  stubApiRoutes,
  type ApiStub,
  type StubRoute,
} from "../../../tests/api-stub";

import { IncompleteResumesPage } from "./incomplete-resumes-page";

const incomplete = {
  id: "60000000-0000-4000-8000-000000000001",
  full_name: "Pessoa Sintética",
  email: "candidate@example.invalid",
  phone: "51999999999",
  city: "Porto Alegre",
  state: "RS",
  missing_fields: ["summary", "experiences", "portfolio"],
  last_guidance: null,
};
const guidance = {
  id: "70000000-0000-4000-8000-000000000001",
  note: "Liguei e expliquei como preencher o resumo.",
  created_at: "2026-10-13T15:00:00Z",
  administrator_name: "Admin Sintético",
};
const complete = {
  ...incomplete,
  id: "60000000-0000-4000-8000-000000000002",
  full_name: "Outra Pessoa",
  city: null,
  state: null,
  missing_fields: [],
  last_guidance: guidance,
};
const incompleteList =
  "GET /professionals?completeness=incomplete&limit=50&offset=0";
const guidanceRoute = `POST /professionals/${incomplete.id}/guidance`;

let stub: ApiStub | undefined;

afterEach(() => {
  stub?.restore();
  stub = undefined;
});

function mount(routes: Record<string, StubRoute>) {
  stub = stubApiRoutes(routes);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <IncompleteResumesPage />
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

function card(name: string) {
  return within(screen.getByRole("article", { name }));
}

describe("IncompleteResumesPage", () => {
  it("lists incomplete résumés with what each one is missing", async () => {
    mount({ [incompleteList]: { status: 200, data: [incomplete] } });

    expect(
      await screen.findByRole("article", { name: "Pessoa Sintética" }),
    ).toBeVisible();
    const missing = card("Pessoa Sintética").getByRole("list", {
      name: "O que falta no currículo de Pessoa Sintética",
    });
    expect(
      within(missing)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["Resumo profissional", "Experiência profissional", "portfolio"]);
    expect(
      card("Pessoa Sintética").getByText(
        "candidate@example.invalid · 51999999999 · Porto Alegre/RS",
      ),
    ).toBeVisible();
    expect(
      card("Pessoa Sintética").getByText("Nenhuma orientação registrada."),
    ).toBeVisible();
  });

  it("filters by completeness and contact status", async () => {
    const user = mount({
      [incompleteList]: { status: 200, data: [incomplete] },
      "GET /professionals?completeness=complete&limit=50&offset=0": {
        status: 200,
        data: [complete],
      },
      "GET /professionals?completeness=complete&contact_status=not_contacted&limit=50&offset=0":
        { status: 200, data: [] },
    });
    await screen.findByRole("article", { name: "Pessoa Sintética" });

    await user.selectOptions(screen.getByLabelText("Currículo"), "Completos");

    expect(
      await screen.findByRole("article", { name: "Outra Pessoa" }),
    ).toBeVisible();
    expect(card("Outra Pessoa").getByText("Currículo completo")).toBeVisible();
    expect(
      card("Outra Pessoa").getByText(
        "Última orientação em 13/10/2026, por Admin Sintético",
      ),
    ).toBeVisible();

    await user.selectOptions(
      screen.getByLabelText("Contato"),
      "Sem orientação registrada",
    );

    expect(
      await screen.findByText("Nenhum currículo encontrado com esses filtros."),
    ).toBeVisible();
  });

  it("records guidance and refreshes the list", async () => {
    let contacted = false;
    const user = mount({
      [incompleteList]: () => ({
        status: 200,
        data: [{ ...incomplete, last_guidance: contacted ? guidance : null }],
      }),
      [guidanceRoute]: () => {
        contacted = true;
        return { status: 201, data: guidance };
      },
    });
    await screen.findByRole("article", { name: "Pessoa Sintética" });

    await user.click(
      screen.getByRole("button", {
        name: "Registrar orientação para Pessoa Sintética",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Salvar orientação" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Escreva a orientação antes de salvar.",
    );
    expect(contacted).toBe(false);

    await user.type(screen.getByLabelText("Orientação"), guidance.note);
    await user.click(screen.getByRole("button", { name: "Salvar orientação" }));

    expect(
      await screen.findByText("Orientação registrada para Pessoa Sintética."),
    ).toBeVisible();
    expect(
      await card("Pessoa Sintética").findByText(guidance.note),
    ).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      stub?.requests.find((request) => request.method === "post")?.body,
    ).toEqual({ note: guidance.note });
  });

  it("keeps the note when recording fails", async () => {
    const user = mount({
      [incompleteList]: { status: 200, data: [incomplete] },
      [guidanceRoute]: {
        status: 404,
        data: {
          title: "Not Found",
          status: 404,
          code: "professional_not_found",
        },
      },
    });
    await screen.findByRole("article", { name: "Pessoa Sintética" });

    await user.click(
      screen.getByRole("button", {
        name: "Registrar orientação para Pessoa Sintética",
      }),
    );
    await user.type(screen.getByLabelText("Orientação"), "Mandei e-mail.");
    await user.click(screen.getByRole("button", { name: "Salvar orientação" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Esta pessoa não está mais cadastrada. Atualize a lista.",
    );
    expect(screen.getByLabelText("Orientação")).toHaveValue("Mandei e-mail.");
  });

  it("explains a refused list and retries", async () => {
    let refused = true;
    const user = mount({
      [incompleteList]: () =>
        refused
          ? {
              status: 403,
              data: { title: "Forbidden", status: 403, code: "forbidden" },
            }
          : { status: 200, data: [incomplete] },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Apenas administradores podem ver os currículos.",
    );

    refused = false;
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));

    expect(
      await screen.findByRole("article", { name: "Pessoa Sintética" }),
    ).toBeVisible();
  });

  it("shows a generic failure for an unexpected answer", async () => {
    mount({ [incompleteList]: { status: 200, data: [{ id: 1 }] } });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar os currículos. Tente novamente.",
    );
  });
});
