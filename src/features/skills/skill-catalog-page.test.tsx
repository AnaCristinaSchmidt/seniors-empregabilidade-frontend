import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import {
  stubApiRoutes,
  type ApiStub,
  type RecordedRequest,
  type StubRoute,
} from "../../../tests/api-stub";

import { SkillCatalogPage } from "./skill-catalog-page";

const teamwork = {
  id: "64000000-0000-4000-8000-000000000001",
  name: "Trabalho em grupo",
  type: "soft",
  status: "active",
};
const forklift = {
  id: "64000000-0000-4000-8000-000000000002",
  name: "Operação de empilhadeira",
  type: "hard",
  status: "inactive",
};
const firstPage = { items: [teamwork, forklift], total: 2 };
const teamworkRoute = `PATCH /admin/skills/${teamwork.id}`;
const forkliftRoute = `PATCH /admin/skills/${forklift.id}`;

let stub: ApiStub | undefined;

afterEach(() => {
  stub?.restore();
  stub = undefined;
});

/** Answers the catalog list with `list` and every other call through `routes`. */
function mount(
  routes: Record<string, StubRoute> = {},
  list: StubRoute = { status: 200, data: firstPage },
) {
  stub = stubApiRoutes(routes, list);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <SkillCatalogPage />
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

function listRequests(): RecordedRequest[] {
  return (stub?.requests ?? []).filter((request) => request.method === "get");
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

function conflict(): { status: number; data: unknown } {
  return {
    status: 409,
    data: {
      title: "Conflict",
      status: 409,
      code: "skill_name_conflict",
    },
  };
}

describe("SkillCatalogPage", () => {
  it("lists the catalog with type, status and the actions of each skill", async () => {
    mount();

    expect(screen.getByText("Carregando competências…")).toBeVisible();
    await shown("Trabalho em grupo");
    expect(
      screen.getByRole("heading", { level: 1, name: "Competências" }),
    ).toBeVisible();
    expect(row("Trabalho em grupo").getByText("Comportamental")).toBeVisible();
    expect(row("Trabalho em grupo").getByText("Ativa")).toBeVisible();
    expect(row("Operação de empilhadeira").getByText("Técnica")).toBeVisible();
    expect(row("Operação de empilhadeira").getByText("Inativa")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Inativar Trabalho em grupo" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Reativar Operação de empilhadeira" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Editar Trabalho em grupo" }),
    ).toBeVisible();
    expect(screen.getByText("1–2 de 2")).toBeVisible();
    expect(listRequests()[0]?.url).toBe("/admin/skills?limit=20&offset=0");
  });

  it("filters by name, type and status and restarts from the first page", async () => {
    const rows = Array.from({ length: 20 }, (_, index) => ({
      ...teamwork,
      id: "65000000-0000-4000-8000-" + String(index + 1).padStart(12, "0"),
      name: "Competência sintética " + (index + 1),
    }));
    const user = mount({}, (request) => ({
      status: 200,
      data: request.url?.includes("offset=20")
        ? { items: [teamwork], total: 21 }
        : { items: rows, total: 21 },
    }));

    await shown("Competência sintética 1");
    await user.click(screen.getByRole("button", { name: "Próxima" }));
    await shown("Trabalho em grupo");
    expect(screen.getByText("21–21 de 21")).toBeVisible();

    await user.type(
      screen.getByRole("searchbox", { name: "Buscar por nome" }),
      " gestão ",
    );
    await waitFor(() =>
      expect(listRequests().at(-1)?.url).toBe(
        "/admin/skills?search=gest%C3%A3o&limit=20&offset=0",
      ),
    );
    await user.selectOptions(screen.getByLabelText("Tipo"), "soft");
    await user.selectOptions(screen.getByLabelText("Situação"), "inactive");
    await waitFor(() =>
      expect(listRequests().at(-1)?.url).toBe(
        "/admin/skills?search=gest%C3%A3o&type=soft&status=inactive&limit=20&offset=0",
      ),
    );
    expect(screen.getByRole("button", { name: "Anterior" })).toBeDisabled();
  });

  it("tells an empty catalog apart from a search without results", async () => {
    const user = mount({}, { status: 200, data: { items: [], total: 0 } });

    expect(
      await screen.findByText(
        "O catálogo ainda não tem competências. Cadastre a primeira.",
      ),
    ).toBeVisible();
    await user.selectOptions(screen.getByLabelText("Situação"), "active");
    expect(
      await screen.findByText(
        "Nenhuma competência encontrada com esses filtros.",
      ),
    ).toBeVisible();
  });

  it("explains a failed list and loads it again on request", async () => {
    let failing = true;
    const user = mount({}, () =>
      failing
        ? {
            status: 403,
            data: {
              title: "Forbidden",
              status: 403,
              code: "administrator_required",
            },
          }
        : { status: 200, data: firstPage },
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Apenas administradores podem consultar o catálogo de competências.",
    );
    failing = false;
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await shown("Trabalho em grupo");
  });

  it("creates a skill after a type is chosen and keeps the draft when the name exists", async () => {
    let attempts = 0;
    const user = mount({
      "POST /admin/skills": (request) => {
        attempts += 1;
        return attempts === 1
          ? conflict()
          : {
              status: 201,
              data: {
                id: "64000000-0000-4000-8000-000000000003",
                status: "active",
                ...(request.body as object),
              },
            };
      },
    });
    await shown("Trabalho em grupo");

    await user.click(screen.getByRole("button", { name: "Nova competência" }));
    const dialog = within(await screen.findByRole("dialog"));
    await user.click(
      dialog.getByRole("button", { name: "Cadastrar competência" }),
    );
    expect(
      await dialog.findByText("Informe o nome da competência."),
    ).toBeVisible();
    expect(dialog.getByText("Escolha o tipo da competência.")).toBeVisible();
    expect(attempts).toBe(0);

    const name = dialog.getByRole("textbox", { name: "Nome *" });
    await user.type(name, "Trabalho em grupo");
    await user.click(dialog.getByRole("radio", { name: "Comportamental" }));
    await user.click(
      dialog.getByRole("button", { name: "Cadastrar competência" }),
    );
    expect(
      await dialog.findByText(
        "Já existe uma competência com esse nome no catálogo. Se ela estiver inativa, reative-a na lista.",
      ),
    ).toBeVisible();
    expect(name).toHaveFocus();
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(dialog.getByRole("radio", { name: "Comportamental" })).toBeChecked();

    const listsBefore = listRequests().length;
    await user.clear(name);
    await user.type(name, "Comunicação com clientes");
    await user.click(
      dialog.getByRole("button", { name: "Cadastrar competência" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Competência “Comunicação com clientes” cadastrada.",
    );
    expect(stub?.requests.at(-2)?.body).toEqual({
      name: "Comunicação com clientes",
      type: "soft",
    });
    await waitFor(() =>
      expect(listRequests().length).toBeGreaterThan(listsBefore),
    );
  });

  it("starts a new skill from an empty form after a cancelled draft", async () => {
    const user = mount();
    await shown("Trabalho em grupo");

    await user.click(screen.getByRole("button", { name: "Nova competência" }));
    let dialog = within(await screen.findByRole("dialog"));
    await user.type(dialog.getByRole("textbox", { name: "Nome *" }), "Excel");
    await user.click(dialog.getByRole("button", { name: "Cancelar" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: "Nova competência" }));
    dialog = within(await screen.findByRole("dialog"));
    expect(dialog.getByRole("textbox", { name: "Nome *" })).toHaveValue("");
    expect(dialog.getByRole("radio", { name: "Técnica" })).not.toBeChecked();
  });

  it("edits a skill from its stored values", async () => {
    const user = mount({
      [teamworkRoute]: (request) => ({
        status: 200,
        data: { ...teamwork, ...(request.body as object) },
      }),
    });
    await shown("Trabalho em grupo");

    await user.click(
      screen.getByRole("button", { name: "Editar Trabalho em grupo" }),
    );
    const dialog = within(await screen.findByRole("dialog"));
    expect(
      dialog.getByRole("heading", { name: "Editar competência" }),
    ).toBeVisible();
    const name = dialog.getByRole("textbox", { name: "Nome *" });
    expect(name).toHaveValue("Trabalho em grupo");
    expect(dialog.getByRole("radio", { name: "Comportamental" })).toBeChecked();

    await user.clear(name);
    await user.type(name, "Trabalho em equipe");
    await user.click(dialog.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Competência “Trabalho em equipe” atualizada.",
      ),
    );
    expect(
      stub?.requests.find((request) => request.method === "patch")?.body,
    ).toEqual({ name: "Trabalho em equipe", type: "soft" });
  });

  it("keeps the values and explains a save that did not reach the server", async () => {
    const user = mount({ [teamworkRoute]: { status: 0 } });
    await shown("Trabalho em grupo");

    await user.click(
      screen.getByRole("button", { name: "Editar Trabalho em grupo" }),
    );
    const dialog = within(await screen.findByRole("dialog"));
    await user.click(dialog.getByRole("radio", { name: "Técnica" }));
    await user.click(dialog.getByRole("button", { name: "Salvar alterações" }));

    expect(await dialog.findByRole("alert")).toHaveTextContent(
      "Não foi possível salvar a competência. Os dados foram mantidos; tente novamente.",
    );
    expect(dialog.getByRole("radio", { name: "Técnica" })).toBeChecked();
    expect(dialog.getByRole("textbox", { name: "Nome *" })).toHaveValue(
      "Trabalho em grupo",
    );
  });

  it("inactivates a skill only after the confirmation", async () => {
    let inactive = false;
    const user = mount(
      {
        [teamworkRoute]: () => {
          inactive = true;
          return { status: 200, data: { ...teamwork, status: "inactive" } };
        },
      },
      () => ({
        status: 200,
        data: {
          items: [
            { ...teamwork, status: inactive ? "inactive" : "active" },
            forklift,
          ],
          total: 2,
        },
      }),
    );
    await shown("Trabalho em grupo");

    await user.click(
      screen.getByRole("button", { name: "Inativar Trabalho em grupo" }),
    );
    let confirmation = within(await screen.findByRole("alertdialog"));
    expect(
      confirmation.getByText(/deixa de aparecer nas sugestões/),
    ).toBeVisible();
    await user.click(confirmation.getByRole("button", { name: "Cancelar" }));
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(inactive).toBe(false);

    await user.click(
      screen.getByRole("button", { name: "Inativar Trabalho em grupo" }),
    );
    confirmation = within(await screen.findByRole("alertdialog"));
    await user.click(
      confirmation.getByRole("button", { name: "Inativar competência" }),
    );

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Competência “Trabalho em grupo” inativada. Ela não aparece mais nas sugestões.",
      ),
    );
    expect(
      await screen.findByRole("button", {
        name: "Reativar Trabalho em grupo",
      }),
    ).toBeVisible();
    expect(row("Trabalho em grupo").getByText("Inativa")).toBeVisible();
    expect(
      stub?.requests.find((request) => request.method === "patch")?.body,
    ).toEqual({ status: "inactive" });
  });

  it("keeps the confirmation open when the inactivation fails", async () => {
    const user = mount({ [teamworkRoute]: { status: 0 } });
    await shown("Trabalho em grupo");

    await user.click(
      screen.getByRole("button", { name: "Inativar Trabalho em grupo" }),
    );
    const confirmation = within(await screen.findByRole("alertdialog"));
    await user.click(
      confirmation.getByRole("button", { name: "Inativar competência" }),
    );

    expect(await confirmation.findByRole("alert")).toHaveTextContent(
      "Não foi possível inativar a competência. Tente novamente.",
    );
    expect(screen.getByRole("alertdialog")).toBeVisible();
  });

  it("reactivates a skill directly and explains a refusal", async () => {
    let attempts = 0;
    const user = mount({
      [forkliftRoute]: () => {
        attempts += 1;
        return attempts === 1
          ? {
              status: 404,
              data: {
                title: "Not Found",
                status: 404,
                code: "skill_not_found",
              },
            }
          : { status: 200, data: { ...forklift, status: "active" } };
      },
    });
    await shown("Operação de empilhadeira");

    const reactivate = screen.getByRole("button", {
      name: "Reativar Operação de empilhadeira",
    });
    await user.click(reactivate);
    expect(
      await row("Operação de empilhadeira").findByRole("alert"),
    ).toHaveTextContent(
      "Esta competência não está mais disponível. Atualize a lista.",
    );
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();

    await user.click(reactivate);
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Competência “Operação de empilhadeira” reativada e de volta às sugestões.",
      ),
    );
    expect(stub?.requests.at(-2)?.body).toEqual({ status: "active" });
  });
});
