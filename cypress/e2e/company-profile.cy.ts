import type * as axe from "axe-core";

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";
const wcag = {
  runOnly: {
    type: "tag" as const,
    values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
  },
};

function reportViolations(violations: axe.Result[]): void {
  throw new Error(
    violations
      .map((violation) =>
        [
          `${violation.id} (${violation.impact ?? "unknown"}): ${violation.help}`,
          ...violation.nodes.map(
            (node) => `  target: ${node.target.join(" ")}`,
          ),
        ].join("\n"),
      )
      .join("\n\n"),
  );
}

const profile = {
  id: COMPANY_ID,
  cnpj: "11222333000181",
  display_name: "Empresa Sintética",
  legal_name: "Empresa Sintética Serviços Ltda",
  industry: null,
  address: {
    street: "Rua das Flores",
    number: "120",
    complement: null,
    neighborhood: "Centro",
    city: "Porto Alegre",
    state: "RS",
    zip_code: "90010000",
  },
  contact_email: "contato@example.invalid",
  contact_phone: null,
};

function signInAsApprovedCompany(): void {
  cy.intercept("GET", "**/auth/me", {
    body: { id: COMPANY_ID, user_type: "company", company_status: "approved" },
  }).as("currentUser");
  cy.intercept("GET", /\/notifications\/me(\?|$)/, {
    body: { items: [], unread_count: 0, next_cursor: null },
  });
  cy.intercept(
    { method: "GET", pathname: "/api/v1/companies/me/profile" },
    { body: profile },
  ).as("profile");
}

describe("company profile", () => {
  it("opens the profile from the sidebar and shows every section", () => {
    signInAsApprovedCompany();

    cy.visit("/empresa", {
      onBeforeLoad(window) {
        window.sessionStorage.setItem("seniors.access-token", "e2e-company");
      },
    });
    cy.wait("@currentUser");

    cy.contains("nav a", "Perfil").click();
    cy.wait("@profile");

    cy.location("pathname").should("eq", "/empresa/perfil");
    cy.contains("nav a", "Perfil").should("have.attr", "aria-current", "page");
    cy.contains("h1", "Perfil da empresa");
    cy.contains("h2", "Empresa Sintética");
    cy.contains("dd", "11.222.333/0001-81");
    cy.contains("dd", "90010-000");
    cy.contains("dd", "contato@example.invalid");

    cy.injectAxe();
    cy.checkA11y("main", wcag, reportViolations);
  });

  it("edits the profile in the modal and returns to the updated view", () => {
    signInAsApprovedCompany();
    cy.intercept(
      { method: "PUT", pathname: "/api/v1/companies/me/profile" },
      (request) => {
        request.reply({
          body: { ...profile, ...(request.body as object) },
        });
      },
    ).as("saveProfile");

    cy.visit("/empresa/perfil", {
      onBeforeLoad(window) {
        window.sessionStorage.setItem("seniors.access-token", "e2e-company");
      },
    });
    cy.wait("@profile");

    cy.contains("button", "Editar perfil").click();
    cy.get('[role="dialog"]').should("be.visible");
    cy.contains("h2", "Editar perfil da empresa");
    cy.get('[role="dialog"]').within(() => {
      cy.contains("label", "CNPJ")
        .invoke("attr", "for")
        .then((id) => {
          cy.get(`#${String(id)}`).should("have.attr", "readonly");
        });
    });
    cy.injectAxe();
    cy.checkA11y('[role="dialog"]', wcag, reportViolations);

    cy.contains("label", "Nome da empresa")
      .invoke("attr", "for")
      .then((id) => {
        cy.get(`#${String(id)}`)
          .clear()
          .type("Empresa Sintética Nova");
      });
    cy.contains("button", "Salvar").click();

    cy.wait("@saveProfile").its("request.body").should("deep.include", {
      display_name: "Empresa Sintética Nova",
      contact_email: "contato@example.invalid",
      industry: null,
    });
    cy.get('[role="dialog"]').should("not.exist");
    cy.contains("h2", "Empresa Sintética Nova");
    cy.contains("Perfil atualizado. As alterações já aparecem abaixo.");
    cy.focused().should("contain.text", "Editar perfil");
  });
});
