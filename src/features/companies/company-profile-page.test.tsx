import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import {
  stubApiRoutes,
  type ApiStub,
  type StubResponse,
} from "../../../tests/api-stub";

import { CompanyProfilePage } from "./company-profile-page";

const PROFILE_ROUTE = "GET /companies/me/profile";

const profile = {
  id: "11111111-1111-4111-8111-111111111111",
  cnpj: "11222333000181",
  display_name: "Empresa Exemplo",
  legal_name: "Empresa Exemplo Serviços Ltda",
  industry: "Tecnologia",
  address: {
    street: "Rua das Flores",
    number: "120",
    complement: "Sala 3",
    neighborhood: "Centro",
    city: "Porto Alegre",
    state: "RS",
    zip_code: "90010000",
  },
  contact_email: "contato@empresa-exemplo.com.br",
  contact_phone: "+55 51 3333-0000",
};

let stub: ApiStub | undefined;

afterEach(() => {
  stub?.restore();
  stub = undefined;
});

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <CompanyProfilePage />
    </QueryClientProvider>,
  );
}

function section(name: string) {
  return within(screen.getByRole("region", { name }));
}

function problem(status: number, code: string): StubResponse {
  return { status, data: { title: "Problem", status, code } };
}

describe("CompanyProfilePage", () => {
  it("shows every section of the company profile", async () => {
    stub = stubApiRoutes({ [PROFILE_ROUTE]: { status: 200, data: profile } });

    renderPage();

    expect(
      await screen.findByRole("heading", { level: 2, name: "Empresa Exemplo" }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { level: 1, name: "Perfil da empresa" }),
    ).toBeVisible();

    const details = section("Dados da empresa");
    expect(details.getByText("Empresa Exemplo Serviços Ltda")).toBeVisible();
    expect(details.getByText("11.222.333/0001-81")).toBeVisible();
    expect(details.getByText("Tecnologia")).toBeVisible();

    const address = section("Endereço");
    expect(address.getByText("Rua das Flores, 120, Sala 3")).toBeVisible();
    expect(address.getByText("Centro")).toBeVisible();
    expect(address.getByText("Porto Alegre – RS")).toBeVisible();
    expect(address.getByText("90010-000")).toBeVisible();

    const contact = section("Contato");
    expect(contact.getByText("contato@empresa-exemplo.com.br")).toBeVisible();
    expect(contact.getByText("+55 51 3333-0000")).toBeVisible();

    expect(stub.requests).toHaveLength(1);
  });

  it("pairs each value with its label", async () => {
    stub = stubApiRoutes({ [PROFILE_ROUTE]: { status: 200, data: profile } });

    renderPage();

    const details = within(
      await screen.findByRole("region", { name: "Dados da empresa" }),
    );
    const labels = details.getAllByRole("term").map((term) => term.textContent);
    const values = details
      .getAllByRole("definition")
      .map((definition) => definition.textContent);

    expect(labels).toEqual([
      "Nome da empresa",
      "Razão social",
      "CNPJ",
      "Área de atuação",
    ]);
    expect(values).toEqual([
      "Empresa Exemplo",
      "Empresa Exemplo Serviços Ltda",
      "11.222.333/0001-81",
      "Tecnologia",
    ]);
  });

  it("falls back to the legal name and marks the optional fields left blank", async () => {
    stub = stubApiRoutes({
      [PROFILE_ROUTE]: {
        status: 200,
        data: {
          ...profile,
          display_name: null,
          industry: null,
          address: { ...profile.address, complement: null },
          contact_phone: null,
        },
      },
    });

    renderPage();

    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "Empresa Exemplo Serviços Ltda",
      }),
    ).toBeVisible();

    const details = section("Dados da empresa");
    expect(details.getByText("Não informado")).toBeVisible();
    expect(details.getByText("Não informada")).toBeVisible();
    expect(section("Endereço").getByText("Rua das Flores, 120")).toBeVisible();
    expect(section("Contato").getByText("Não informado")).toBeVisible();
  });

  it("says when the company has no address yet", async () => {
    stub = stubApiRoutes({
      [PROFILE_ROUTE]: { status: 200, data: { ...profile, address: null } },
    });

    renderPage();

    expect(
      await screen.findByText("Nenhum endereço cadastrado ainda."),
    ).toBeVisible();
    expect(section("Endereço").queryByRole("term")).not.toBeInTheDocument();
  });

  it("shows a loading state while the profile is requested", () => {
    stub = stubApiRoutes({
      [PROFILE_ROUTE]: () => new Promise<StubResponse>(() => undefined),
    });

    renderPage();

    expect(
      screen.getByText("Carregando o perfil da empresa…"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("offers a retry after a failure and shows the profile once it loads", async () => {
    let attempts = 0;
    stub = stubApiRoutes({
      [PROFILE_ROUTE]: () => {
        attempts += 1;
        return attempts === 1
          ? problem(500, "internal_error")
          : { status: 200, data: profile };
      },
    });
    const user = userEvent.setup();

    renderPage();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Não foi possível carregar o perfil da empresa. Tente novamente.",
    );

    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));

    expect(
      await screen.findByRole("heading", { level: 2, name: "Empresa Exemplo" }),
    ).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(stub.requests).toHaveLength(2);
  });

  it("explains that a company awaiting approval has no profile yet", async () => {
    stub = stubApiRoutes({
      [PROFILE_ROUTE]: problem(403, "approved_company_required"),
    });

    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Sua empresa ainda não foi aprovada.",
    );
    expect(
      screen.queryByRole("button", { name: "Tentar novamente" }),
    ).not.toBeInTheDocument();
  });

  it("asks to sign in again when the session expired", async () => {
    stub = stubApiRoutes({
      [PROFILE_ROUTE]: problem(401, "invalid_access_token"),
    });

    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Sua sessão expirou. Entre novamente para ver o perfil.",
    );
  });

  it("treats a response outside the contract as a failure", async () => {
    stub = stubApiRoutes({
      [PROFILE_ROUTE]: { status: 200, data: { ...profile, cnpj: undefined } },
    });

    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar o perfil da empresa. Tente novamente.",
    );
    expect(
      screen.getByRole("button", { name: "Tentar novamente" }),
    ).toBeVisible();
  });

  it("keeps the generic message for a network failure", async () => {
    stub = stubApiRoutes({ [PROFILE_ROUTE]: { status: 0 } });

    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar o perfil da empresa. Tente novamente.",
    );
  });
});
