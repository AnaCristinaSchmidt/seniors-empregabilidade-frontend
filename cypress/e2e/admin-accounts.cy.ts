const candidate = {
  id: "60000000-0000-4000-8000-000000000001",
  user_type: "candidate",
  email: "candidate@example.invalid",
  display_name: "Pessoa Sintética",
  account_status: "active",
  company_status: null,
  completion_percentage: 100,
  missing_fields: ["city"],
  created_at: "2026-10-20T12:00:00Z",
};
const company = {
  ...candidate,
  id: "60000000-0000-4000-8000-000000000002",
  user_type: "company",
  email: "company@example.invalid",
  display_name: "Empresa Sintética",
  company_status: "approved",
  completion_percentage: null,
  missing_fields: null,
};
const completeCandidate = {
  ...candidate,
  id: "60000000-0000-4000-8000-000000000003",
  display_name: "Currículo completo sintético",
  completion_percentage: 0,
  missing_fields: [],
};
const detail = {
  ...candidate,
  application_count: 1,
  summary: "Resumo sintético.",
  experiences: [
    {
      id: "61000000-0000-4000-8000-000000000001",
      role: "Gerente",
      company_name: "Empresa Sintética",
      start_date: "2000-01-01",
      end_date: null,
    },
  ],
  education: [
    {
      id: "62000000-0000-4000-8000-000000000001",
      institution: "Instituto Sintético",
      degree: "Gestão",
      field: null,
      start_date: null,
      end_date: null,
    },
  ],
  skills: [{ id: "63000000-0000-4000-8000-000000000001", name: "Gestão" }],
  legal_name: null,
  trade_name: null,
  cnpj: null,
  corporate_email: null,
  city: null,
  state: null,
  industry: null,
  company_size: null,
  published_job_count: null,
};
const wcag = {
  runOnly: {
    type: "tag" as const,
    values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
  },
};

function openAccounts(): void {
  cy.intercept("POST", "**/auth/login", {
    body: {
      access_token: "synthetic-admin",
      id_token: "synthetic-id",
      refresh_token: null,
      expires_in: 900,
      token_type: "Bearer",
      user_id: candidate.id,
      user_type: "administrator",
    },
  });
  cy.intercept("GET", "**/auth/me", {
    body: {
      id: candidate.id,
      user_type: "administrator",
      company_status: null,
    },
  });
  cy.intercept("GET", "**/admin/accounts/" + candidate.id, { body: detail });
  cy.visit("/login");
  cy.get("#email").type("administrator@example.invalid");
  cy.get("#password").type("SyntheticTest123!");
  cy.contains("button", /^Entrar$/).click();
  cy.contains("a", "Cadastros").click();
  cy.contains("h1", "Cadastros").should("be.visible");
}
function openCandidate(): void {
  cy.get('button[aria-label="Ver cadastro de Pessoa Sintética"]').click();
  cy.get('[role="dialog"]')
    .should("be.visible")
    .and("have.css", "opacity", "1");
}

describe("administrator account management", () => {
  it("opens from the menu, reflows the page and filters by US-08 completeness", () => {
    cy.intercept("GET", "**/admin/accounts?*", (request) => {
      request.reply({
        items:
          request.query.completeness === "complete"
            ? [completeCandidate]
            : [candidate, company, completeCandidate],
        total: request.query.completeness === "complete" ? 1 : 3,
      });
    }).as("accounts");
    openAccounts();
    cy.wait("@accounts");
    cy.contains("td", "Currículo incompleto").should("exist");
    cy.contains("td", "Currículo completo").should("exist");
    for (const width of [1280, 1024, 768, 390]) {
      cy.viewport(width, 844);
      cy.document().then((document) => {
        expect(document.documentElement.scrollWidth).to.be.at.most(
          document.documentElement.clientWidth,
        );
      });
      cy.injectAxe();
      cy.checkA11y("main", wcag);
    }
    cy.contains("label", "Currículo do profissional")
      .invoke("attr", "for")
      .then((id) => {
        cy.get('select[id="' + id + '"]').select("complete");
      });
    cy.wait("@accounts")
      .its("request.query")
      .should("include", { completeness: "complete", offset: "0" });
    cy.contains("th", "Currículo completo sintético").should("exist");
    cy.contains("0% completo").should("not.exist");
  });

  it("keeps details keyboard accessible and preserves the reason when saving fails", () => {
    let blocked = false;
    cy.intercept("GET", "**/admin/accounts?*", (request) => {
      request.reply({
        items: [
          { ...candidate, account_status: blocked ? "blocked" : "active" },
        ],
        total: 1,
      });
    });
    let attempts = 0;
    let releaseFailure: () => void = () => undefined;
    const failureGate = new Promise<void>((resolve) => {
      releaseFailure = resolve;
    });
    cy.intercept("PATCH", "**/admin/accounts/*/status", (request) => {
      attempts++;
      if (attempts === 1) {
        return failureGate.then(() => {
          request.reply({
            statusCode: 503,
            body: {
              code: "synthetic_failure",
              status: 503,
              title: "Unavailable",
            },
          });
        });
      } else {
        expect(request.body).to.deep.equal({
          status: "blocked",
          reason: "Justificativa sintética.",
        });
        blocked = true;
        request.reply({ id: candidate.id, account_status: "blocked" });
      }
    }).as("statusChange");
    openAccounts();
    openCandidate();
    cy.get('[role="region"][aria-label="Dados do cadastro"]')
      .focus()
      .should("be.focused");
    cy.injectAxe();
    cy.checkA11y('[role="dialog"]', wcag);
    cy.get('[role="dialog"] textarea').type("  Justificativa sintética.  ");
    cy.get('[role="dialog"]')
      .contains("button", /^Bloquear$/)
      .click();
    cy.get("body").type("{esc}");
    cy.get('[role="dialog"]').should("be.visible");
    cy.get('[role="dialog"] textarea').should("be.disabled");
    cy.get('[role="dialog"]')
      .contains("button", /^Fechar$/)
      .should("be.disabled");
    cy.then(() => releaseFailure());
    cy.wait("@statusChange");
    cy.get('[role="dialog"] [role="alert"]').should(
      "contain.text",
      "justificativa foi mantida",
    );
    cy.get('[role="dialog"] textarea').should(
      "have.value",
      "  Justificativa sintética.  ",
    );
    cy.get('[role="dialog"]')
      .contains("button", /^Bloquear$/)
      .should("be.enabled")
      .click();
    cy.wait("@statusChange");
    cy.get('[role="dialog"]').should("not.exist");
    cy.contains("Conta de Pessoa Sintética bloqueada.").should("be.visible");
  });

  it("returns to existing accounts when the last row leaves the current page", () => {
    let removed = false;
    const firstRows = Array.from({ length: 20 }, (_, index) => ({
      ...candidate,
      id: "71000000-0000-4000-8000-" + String(index + 1).padStart(12, "0"),
      display_name: "Synthetic professional " + (index + 1),
    }));
    cy.intercept("GET", "**/admin/accounts?*", (request) => {
      request.reply({
        items:
          Number(request.query.offset) === 20
            ? removed
              ? []
              : [candidate]
            : firstRows,
        total: removed ? 20 : 21,
      });
    });
    cy.intercept("PATCH", "**/admin/accounts/*/status", (request) => {
      removed = true;
      request.reply({ id: candidate.id, account_status: "blocked" });
    });
    openAccounts();
    cy.contains("button", /^Próxima$/).click();
    cy.contains("21–21 de 21").should("be.visible");
    openCandidate();
    cy.get('[role="dialog"] textarea').type("Verificação sintética.");
    cy.get('[role="dialog"]')
      .contains("button", /^Bloquear$/)
      .click();
    cy.contains("Não há mais contas nesta página.").should("be.visible");
    cy.contains("button", /^Próxima$/).should("be.disabled");
    cy.contains("button", /^Anterior$/)
      .should("be.enabled")
      .click();
    cy.contains("th", "Synthetic professional 1").should("exist");
    cy.contains("1–20 de 20").should("be.visible");
  });
});
