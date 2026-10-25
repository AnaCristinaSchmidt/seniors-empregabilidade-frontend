import type * as axe from "axe-core";

const activeApplication = {
  id: "10000000-0000-4000-8000-000000000001",
  job_id: "20000000-0000-4000-8000-000000000001",
  job_title: "Analista",
  company_name: "Empresa Aurora",
  submitted_at: "2026-08-05T02:00:00Z",
  days_in_process: 7,
  status: "under_review",
  similar_jobs: [],
};
const rejectedApplication = {
  ...activeApplication,
  id: "10000000-0000-4000-8000-000000000002",
  status: "not_selected",
  company_name: "Empresa Horizonte",
  similar_jobs: [
    {
      id: "30000000-0000-4000-8000-000000000001",
      title: "Supervisão",
      company_name: "Empresa Exemplo",
    },
  ],
};
const wcag = {
  runOnly: {
    type: "tag" as const,
    values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
  },
};

// Fail with each rule, reason and element, so a failure seen only in CI
// explains itself in the job output.
function reportViolations(violations: axe.Result[]): void {
  throw new Error(
    violations
      .map((violation) =>
        [
          `${violation.id} (${violation.impact ?? "unknown"}): ${violation.help}`,
          ...violation.nodes.map((node) =>
            [
              `  target: ${node.target.join(" ")}`,
              `  ${node.failureSummary ?? ""}`,
              `  html: ${node.html.slice(0, 200)}`,
            ].join("\n"),
          ),
        ].join("\n"),
      )
      .join("\n\n"),
  );
}

describe("candidate applications", () => {
  beforeEach(() => {
    let current = { ...activeApplication };
    cy.intercept("GET", "**/auth/me", {
      body: {
        id: activeApplication.id,
        user_type: "candidate",
        company_status: null,
      },
    }).as("currentUser");
    cy.intercept("GET", "**/applications/me*", (req) => {
      const filter =
        new URL(req.url).searchParams.get("company_name")?.toLowerCase() ?? "";
      req.reply(
        [current, rejectedApplication].filter((item) =>
          item.company_name.toLowerCase().includes(filter),
        ),
      );
    }).as("list");
    cy.intercept("POST", "**/applications/*/withdraw", (req) => {
      current = { ...current, status: "withdrawn" };
      req.reply({ body: current, delay: 600 });
    }).as("withdraw");
    cy.visit("/candidato", {
      onBeforeLoad(window) {
        window.sessionStorage.setItem(
          "seniors.access-token",
          "synthetic-access",
        );
      },
    });
    cy.wait("@currentUser")
      .its("request.headers.authorization")
      .should("eq", "Bearer synthetic-access");
    cy.contains("a", "Candidaturas").click();
    cy.wait("@list");
  });

  it("filters, shows suggestions and preserves the updated status after withdrawal", () => {
    cy.get("main").should("have.length", 1);
    cy.contains("Em análise").should("be.visible");
    cy.injectAxe();
    cy.checkA11y(undefined, wcag, reportViolations);
    cy.contains("button", "Ver vagas parecidas").click();
    cy.contains("Supervisão").should("be.visible");
    cy.contains("Empresa Exemplo").should("be.visible");
    cy.get("#search").type("Aurora");
    cy.get('[role="article"]').should("have.length", 1);
    cy.contains("Empresa Horizonte").should("not.exist");
    cy.contains("button", "Sair do processo").click();
    cy.get('[role="alertdialog"]').should("be.visible");
    // Mid fade-in the dialog text blends with the backdrop, so measure it
    // only once the opening animation has finished.
    cy.get('[role="alertdialog"]').should("have.css", "opacity", "1");
    cy.checkA11y('[role="alertdialog"]', wcag, reportViolations);
    cy.contains("button", "Cancelar").should("be.focused").click();
    cy.get('[role="alertdialog"]').should("not.exist");
    cy.contains("Em análise").should("be.visible");
    cy.contains("button", "Sair do processo").click();
    cy.get('[role="alertdialog"]')
      .contains("button", "Sair do processo")
      .click();
    cy.contains("button", "Cancelar").should("be.disabled");
    cy.get("body").type("{esc}");
    cy.get('[role="alertdialog"]').should("exist");
    cy.wait("@withdraw");
    cy.get('[role="alertdialog"]').should("not.exist");
    cy.get('[role="article"]').should(
      "contain.text",
      "Você saiu do processo seletivo",
    );
    cy.contains("button", "Sair do processo").should("not.exist");
    cy.reload();
    cy.contains("Você optou por sair deste processo seletivo").should(
      "be.visible",
    );
  });

  it("announces a failure and clears it when the confirmation is reopened", () => {
    cy.intercept("POST", "**/applications/*/withdraw", {
      statusCode: 500,
      body: { title: "Error", status: 500, code: "internal_error" },
    });
    cy.contains("button", "Sair do processo").click();
    cy.get('[role="alertdialog"]')
      .contains("button", "Sair do processo")
      .click();
    cy.get('[role="alertdialog"] [role="alert"]').should(
      "contain.text",
      "Não foi possível confirmar",
    );
    cy.contains("button", "Cancelar").click();
    cy.get('[role="alertdialog"]').should("not.exist");
    cy.contains("button", "Sair do processo").click();
    cy.get('[role="alertdialog"] [role="alert"]').should("not.exist");
  });
});
