import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import {
  stubApiRoutes,
  type ApiStub,
  type StubResponse,
  type StubRoute,
} from "../../../tests/api-stub";

import { CompanyProfilePage } from "./company-profile-page";

const GET_PROFILE = "GET /companies/me/profile";
const PUT_PROFILE = "PUT /companies/me/profile";
const NEW_ZIP = "01001000";
const LOOKUP = `GET https://viacep.com.br/ws/${NEW_ZIP}/json/`;
const TITLE = "Editar perfil da empresa";
const GENERIC_ERROR =
  "Não foi possível salvar as alterações. Seus dados foram mantidos; tente novamente.";

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

/** What the form sends when nothing is changed. */
const unchanged = {
  display_name: profile.display_name,
  legal_name: profile.legal_name,
  industry: profile.industry,
  address: profile.address,
  contact_email: profile.contact_email,
  contact_phone: profile.contact_phone,
};

const postalAddress = {
  cep: "01001-000",
  logradouro: "Praça Exemplo",
  bairro: "Bairro Exemplo",
  localidade: "Cidade Exemplo",
  uf: "SP",
};

let stub: ApiStub | undefined;

afterEach(() => {
  stub?.restore();
  stub = undefined;
});

function mount(
  routes: Record<string, StubRoute> = {},
  stored: object = profile,
) {
  stub = stubApiRoutes({
    [GET_PROFILE]: { status: 200, data: stored },
    // The PUT answers with the stored profile: echo what was sent.
    [PUT_PROFILE]: (request) => ({
      status: 200,
      data: { ...stored, ...(request.body as object), cnpj: profile.cnpj },
    }),
    ...routes,
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <CompanyProfilePage />
    </QueryClientProvider>,
  );
  return { user: userEvent.setup() };
}

function requests(route: string) {
  const [method, url] = route.split(" ");
  return (
    stub?.requests.filter(
      (request) =>
        request.method === method?.toLowerCase() && request.url === url,
    ) ?? []
  );
}

async function openModal(user: UserEvent) {
  await user.click(
    await screen.findByRole("button", { name: "Editar perfil" }),
  );
  await screen.findByRole("heading", { name: TITLE });
}

async function expectClosed() {
  await waitFor(() =>
    expect(screen.queryByRole("heading", { name: TITLE })).toBeNull(),
  );
}

async function replace(user: UserEvent, label: string, value: string) {
  const input = screen.getByLabelText(label);
  await user.clear(input);
  if (value) await user.type(input, value);
}

function problem(status: number, code: string, errors?: object): StubResponse {
  return {
    status,
    data: { title: "Problem", status, code, detail: "English text", errors },
  };
}

describe("Company profile edit modal", () => {
  it("opens filled with the profile, without looking up the saved CEP", async () => {
    const { user } = mount();
    await openModal(user);

    expect(screen.getByLabelText("Nome da empresa *")).toHaveValue(
      profile.display_name,
    );
    expect(screen.getByLabelText("Razão social *")).toHaveValue(
      profile.legal_name,
    );
    expect(screen.getByLabelText("Área de atuação (opcional)")).toHaveValue(
      "Tecnologia",
    );
    expect(screen.getByLabelText("E-mail de contato *")).toHaveValue(
      profile.contact_email,
    );
    expect(screen.getByLabelText("Telefone (opcional)")).toHaveValue(
      profile.contact_phone,
    );
    expect(screen.getByLabelText("CEP *")).toHaveValue("90010-000");
    expect(screen.getByLabelText("Logradouro *")).toHaveValue("Rua das Flores");
    expect(screen.getByLabelText("Número *")).toHaveValue("120");
    expect(screen.getByLabelText("Complemento (opcional)")).toHaveValue(
      "Sala 3",
    );
    expect(screen.getByLabelText("Bairro *")).toHaveValue("Centro");
    expect(screen.getByLabelText("Cidade *")).toHaveValue("Porto Alegre");
    expect(screen.getByLabelText("Estado (UF) *")).toHaveValue("RS");
    expect(stub?.requests.some((r) => r.url?.includes("viacep"))).toBe(false);
  });

  it("shows the CNPJ read-only and points to support for a correction", async () => {
    const { user } = mount();
    await openModal(user);

    const cnpj = screen.getByLabelText("CNPJ");
    expect(cnpj).toHaveValue("11.222.333/0001-81");
    expect(cnpj).toHaveAttribute("readonly");
    expect(cnpj).toHaveAccessibleDescription(
      "O CNPJ não pode ser alterado por aqui. Para corrigir, fale com o suporte.",
    );
  });

  it("saves the whole profile, returns to the updated view and announces it", async () => {
    const { user } = mount();
    await openModal(user);
    await replace(user, "Nome da empresa *", "Empresa Exemplo Nova");
    await replace(user, "Área de atuação (opcional)", "");
    await replace(user, "E-mail de contato *", "RH@Empresa-Exemplo.com.br");
    await replace(user, "Telefone (opcional)", "");
    await replace(user, "Complemento (opcional)", "");

    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await expectClosed();
    expect(requests(PUT_PROFILE)).toHaveLength(1);
    expect(requests(PUT_PROFILE)[0]?.body).toEqual({
      ...unchanged,
      display_name: "Empresa Exemplo Nova",
      industry: null,
      contact_email: "rh@empresa-exemplo.com.br",
      contact_phone: null,
      address: { ...profile.address, complement: null },
    });
    expect(
      screen.getByRole("heading", { level: 2, name: "Empresa Exemplo Nova" }),
    ).toBeVisible();
    expect(screen.getByText("rh@empresa-exemplo.com.br")).toBeVisible();
    expect(
      screen.getByText("Perfil atualizado. As alterações já aparecem abaixo."),
    ).toBeInTheDocument();
    // The saved profile came back with the PUT; nothing is fetched again.
    expect(requests(GET_PROFILE)).toHaveLength(1);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Editar perfil" }),
      ).toHaveFocus(),
    );
  });

  it("discards what was typed on cancel and reopens with the profile", async () => {
    const { user } = mount();
    await openModal(user);
    await replace(user, "Nome da empresa *", "Outro nome");

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    await expectClosed();
    expect(requests(PUT_PROFILE)).toHaveLength(0);
    await openModal(user);
    expect(screen.getByLabelText("Nome da empresa *")).toHaveValue(
      profile.display_name,
    );
  });

  it("closes with Escape without saving", async () => {
    const { user } = mount();
    await openModal(user);
    await replace(user, "Razão social *", "Outra razão");

    await user.keyboard("{Escape}");

    await expectClosed();
    expect(requests(PUT_PROFILE)).toHaveLength(0);
    expect(screen.getByText(profile.legal_name)).toBeVisible();
  });

  it("blocks saving and says what each invalid field needs", async () => {
    const { user } = mount();
    await openModal(user);
    await replace(user, "Nome da empresa *", "");
    await replace(user, "E-mail de contato *", "contato");
    await replace(user, "Telefone (opcional)", "abc");
    await replace(user, "CEP *", "123");
    await replace(user, "Estado (UF) *", "XX");

    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(
      screen.getByLabelText("Nome da empresa *"),
    ).toHaveAccessibleDescription("Preencha este campo.");
    expect(
      screen.getByLabelText("E-mail de contato *"),
    ).toHaveAccessibleDescription(
      "Falta o @ e o domínio. Exemplo: contato@suaempresa.com.br",
    );
    expect(
      screen.getByLabelText("Telefone (opcional)"),
    ).toHaveAccessibleDescription(expect.stringContaining("(51) 3333-0000"));
    expect(screen.getByLabelText("CEP *")).toHaveAccessibleDescription(
      expect.stringContaining("Informe um CEP com 8 números."),
    );
    expect(screen.getByLabelText("Estado (UF) *")).toHaveAccessibleDescription(
      "Informe a sigla do estado, como RS.",
    );
    expect(screen.getByLabelText("Nome da empresa *")).toHaveFocus();
    expect(requests(PUT_PROFILE)).toHaveLength(0);
  });

  it("fills the address from a new CEP and saves it", async () => {
    const { user } = mount({ [LOOKUP]: { status: 200, data: postalAddress } });
    await openModal(user);

    await replace(user, "CEP *", NEW_ZIP);

    await waitFor(() =>
      expect(screen.getByLabelText("Cidade *")).toHaveValue("Cidade Exemplo"),
    );
    expect(screen.getByLabelText("CEP *")).toHaveValue("01001-000");
    expect(screen.getByLabelText("Logradouro *")).toHaveValue("Praça Exemplo");
    expect(screen.getByLabelText("Bairro *")).toHaveValue("Bairro Exemplo");
    expect(screen.getByLabelText("Estado (UF) *")).toHaveValue("SP");
    expect(
      screen.getByText("Endereço preenchido pelo CEP: Cidade Exemplo - SP."),
    ).toBeInTheDocument();

    await replace(user, "Número *", "500");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await expectClosed();
    expect(requests(PUT_PROFILE)[0]?.body).toEqual({
      ...unchanged,
      address: {
        street: "Praça Exemplo",
        number: "500",
        complement: "Sala 3",
        neighborhood: "Bairro Exemplo",
        city: "Cidade Exemplo",
        state: "SP",
        zip_code: NEW_ZIP,
      },
    });
  });

  it("brings back the saved address when the CEP goes back to the saved one", async () => {
    let lookups = 0;
    const { user } = mount({
      [LOOKUP]: () => {
        lookups += 1;
        return { status: 200, data: postalAddress };
      },
    });
    await openModal(user);

    await replace(user, "CEP *", NEW_ZIP);
    await waitFor(() =>
      expect(screen.getByLabelText("Cidade *")).toHaveValue("Cidade Exemplo"),
    );
    await replace(user, "Número *", "500");
    await replace(user, "CEP *", profile.address.zip_code);

    expect(screen.getByLabelText("CEP *")).toHaveValue("90010-000");
    expect(screen.getByLabelText("Logradouro *")).toHaveValue("Rua das Flores");
    expect(screen.getByLabelText("Bairro *")).toHaveValue("Centro");
    expect(screen.getByLabelText("Cidade *")).toHaveValue("Porto Alegre");
    expect(screen.getByLabelText("Estado (UF) *")).toHaveValue("RS");
    expect(screen.getByLabelText("Número *")).toHaveValue("500");
    expect(
      screen.getByText("Endereço cadastrado restaurado: Porto Alegre - RS."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await expectClosed();
    expect(lookups).toBe(1);
    expect(requests(PUT_PROFILE)[0]?.body).toEqual({
      ...unchanged,
      address: { ...profile.address, number: "500" },
    });
  });

  it("keeps a street typed by hand when the saved CEP is retyped", async () => {
    const { user } = mount();
    await openModal(user);

    await replace(user, "Logradouro *", "Rua Manual");
    await user.type(screen.getByLabelText("CEP *"), "{backspace}0");

    expect(screen.getByLabelText("CEP *")).toHaveValue("90010-000");
    expect(screen.getByLabelText("Logradouro *")).toHaveValue("Rua Manual");
    expect(screen.queryByText(/Endereço cadastrado restaurado/)).toBeNull();
  });

  it("keeps the address editable by hand when the CEP lookup fails, and retries", async () => {
    let lookups = 0;
    const { user } = mount({
      [LOOKUP]: () => {
        lookups += 1;
        return { status: 0 };
      },
    });
    await openModal(user);

    await replace(user, "CEP *", NEW_ZIP);

    expect(
      await screen.findByText(
        "Não foi possível consultar o CEP. Você pode preencher o endereço manualmente.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("CEP *")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await user.click(
      screen.getByRole("button", { name: "Consultar CEP novamente" }),
    );
    await waitFor(() => expect(lookups).toBe(2));

    await replace(user, "Logradouro *", "Rua Manual");
    await replace(user, "Bairro *", "Bairro Manual");
    await replace(user, "Cidade *", "Cidade Manual");
    await replace(user, "Estado (UF) *", "sc");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await expectClosed();
    expect(requests(PUT_PROFILE)[0]?.body).toEqual({
      ...unchanged,
      address: {
        street: "Rua Manual",
        number: "120",
        complement: "Sala 3",
        neighborhood: "Bairro Manual",
        city: "Cidade Manual",
        state: "SC",
        zip_code: NEW_ZIP,
      },
    });
  });

  it("says when the CEP does not exist", async () => {
    const { user } = mount({
      [LOOKUP]: { status: 200, data: { erro: "true" } },
    });
    await openModal(user);

    await replace(user, "CEP *", NEW_ZIP);

    expect(
      await screen.findByText(
        "Não encontramos esse CEP. Confira os números e tente novamente. Você pode preencher o endereço manualmente.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Cidade *")).toHaveValue("Porto Alegre");
  });

  it("asks for an address when the profile has none", async () => {
    const { user } = mount(
      { [LOOKUP]: { status: 200, data: postalAddress } },
      { ...profile, display_name: null, address: null },
    );
    await openModal(user);
    expect(screen.getByLabelText("Nome da empresa *")).toHaveValue("");
    expect(screen.getByLabelText("CEP *")).toHaveValue("");
    await replace(user, "Nome da empresa *", "Empresa Exemplo");

    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(screen.getByLabelText("CEP *")).toHaveFocus();
    expect(screen.getByLabelText("Número *")).toHaveAccessibleDescription(
      "Preencha este campo.",
    );
    expect(requests(PUT_PROFILE)).toHaveLength(0);

    await user.type(screen.getByLabelText("CEP *"), NEW_ZIP);
    await waitFor(() =>
      expect(screen.getByLabelText("Cidade *")).toHaveValue("Cidade Exemplo"),
    );
    await user.type(screen.getByLabelText("Número *"), "10");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await expectClosed();
    expect(requests(PUT_PROFILE)[0]?.body).toMatchObject({
      display_name: "Empresa Exemplo",
      address: { zip_code: NEW_ZIP, number: "10", complement: null },
    });
  });

  it("puts a refused personal e-mail on its field and keeps what was typed", async () => {
    const { user } = mount({
      [PUT_PROFILE]: problem(422, "company_email_domain_blocked", {
        "body.contact_email": ["Personal e-mail domains are not accepted"],
      }),
    });
    await openModal(user);
    await replace(user, "E-mail de contato *", "pessoa@gmail.com");

    await user.click(screen.getByRole("button", { name: "Salvar" }));

    const email = screen.getByLabelText("E-mail de contato *");
    expect(
      await screen.findByText(
        "Confira os campos destacados e tente novamente.",
      ),
    ).toBeInTheDocument();
    expect(email).toHaveAccessibleDescription(
      "Use um e-mail corporativo, como contato@suaempresa.com.br.",
    );
    expect(email).toHaveFocus();
    expect(email).toHaveValue("pessoa@gmail.com");
    expect(screen.queryByText("English text")).toBeNull();
  });

  it("marks the fields the API refused and refreshes the profile once closed", async () => {
    const { user } = mount({
      [PUT_PROFILE]: problem(422, "validation_error", {
        "body.legal_name": ["String should have at most 200 characters"],
        "body.address.zip_code": ["String should match pattern"],
        "body.cnpj": ["ignored: not on the form"],
      }),
    });
    await openModal(user);

    await user.click(screen.getByRole("button", { name: "Salvar" }));

    const legalName = screen.getByLabelText("Razão social *");
    await waitFor(() =>
      expect(legalName).toHaveAccessibleDescription(
        "Confira o valor deste campo.",
      ),
    );
    expect(screen.getByLabelText("CEP *")).toHaveAccessibleDescription(
      expect.stringContaining("Confira o valor deste campo."),
    );
    expect(legalName).toHaveFocus();
    expect(requests(GET_PROFILE)).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    await expectClosed();
    await waitFor(() => expect(requests(GET_PROFILE)).toHaveLength(2));
  });

  it.each([
    ["the network fails", { status: 0 }, GENERIC_ERROR],
    ["the server fails", problem(500, "internal_error"), GENERIC_ERROR],
    [
      "the API refuses with no field to point at",
      problem(422, "validation_error", {}),
      GENERIC_ERROR,
    ],
    [
      "the company lost its approval",
      problem(403, "approved_company_required"),
      "Sua empresa ainda não foi aprovada. Assim que a aprovação sair, você poderá editar o perfil.",
    ],
    [
      "the saved profile cannot be read",
      { status: 200, data: { id: "not-a-profile" } },
      "Não conseguimos confirmar o salvamento. Feche esta janela e confira o perfil antes de tentar de novo.",
    ],
  ])(
    "keeps the modal open with the data when %s",
    async (_, response: StubResponse, message: string) => {
      const { user } = mount({ [PUT_PROFILE]: response });
      await openModal(user);
      await replace(user, "Nome da empresa *", "Empresa Exemplo Nova");

      await user.click(screen.getByRole("button", { name: "Salvar" }));

      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: TITLE })).toBeInTheDocument();
      expect(screen.getByLabelText("Nome da empresa *")).toHaveValue(
        "Empresa Exemplo Nova",
      );
      expect(screen.queryByText(/Perfil atualizado/)).toBeNull();
    },
  );

  it("holds the form while saving and cannot be closed mid-request", async () => {
    let complete!: (response: StubResponse) => void;
    const { user } = mount({
      [PUT_PROFILE]: () =>
        new Promise<StubResponse>((resolve) => {
          complete = resolve;
        }),
    });
    await openModal(user);

    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(screen.getByRole("button", { name: "Salvando…" })).toBeDisabled();
    expect(screen.getByLabelText("Nome da empresa *")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("heading", { name: TITLE })).toBeInTheDocument();

    complete({ status: 200, data: profile });
    await expectClosed();
  });

  it("offers no editing until the profile has loaded", async () => {
    mount({ [GET_PROFILE]: problem(500, "internal_error") });

    expect(await screen.findByText("Erro")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editar perfil" })).toBeNull();
  });
});
