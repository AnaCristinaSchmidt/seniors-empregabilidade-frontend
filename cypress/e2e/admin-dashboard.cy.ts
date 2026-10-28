const administratorId = "90000000-0000-4000-8000-000000000001";
const summary = {
  filters: {
    start_date: null,
    end_date: null,
    account_status: null,
    candidate_availability: null,
    company_status: null,
    job_status: null,
    application_status: null,
  },
  totals: { candidates: 4, companies: 3, jobs: 6, applications: 2, matches: 2 },
  segments: {
    candidates_without_placement: 2,
    candidates_with_unknown_employment: 1,
    incomplete_resumes: 3,
  },
};
const wcag = {
  runOnly: {
    type: "tag" as const,
    values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
  },
};

function signIn() {
  cy.intercept("POST", "**/auth/login", {
    body: {
      access_token: "synthetic-administrator",
      id_token: "synthetic-id",
      refresh_token: null,
      expires_in: 900,
      token_type: "Bearer",
      user_id: administratorId,
      user_type: "administrator",
    },
  });
  cy.intercept("GET", "**/auth/me", {
    body: {
      id: administratorId,
      user_type: "administrator",
      company_status: null,
    },
  });
  cy.visit("/login");
  cy.get("#email").type("admin@dashboard.example.invalid");
  cy.get("#password").type("SyntheticTest123!");
  cy.contains("button", "Entrar").click();
  cy.contains("h1", "Relatórios da plataforma").should("be.visible");
}

describe("administrator dashboard", () => {
  it("opens from Reports and applies all filters together, then clears them", () => {
    cy.viewport(1280, 1000);
    cy.intercept("GET", "**/indicators*", { body: summary }).as(
      "initialIndicators",
    );
    signIn();
    cy.wait("@initialIndicators");
    cy.contains("a", "Relatórios").should(
      "have.attr",
      "href",
      "/administrador",
    );
    cy.get("#dashboard-start").type("2026-10-01");
    cy.get("#dashboard-end").type("2026-10-24");
    cy.get("#dashboard-account-status").select("active");
    cy.get("#dashboard-availability").select("available");
    cy.get("#dashboard-company-status").select("approved");
    cy.get("#dashboard-job-status").select("published");
    cy.get("#dashboard-application-status").select("hired");
    cy.contains("Aplique os filtros para atualizar os números.").should(
      "be.visible",
    );
    cy.intercept("GET", "**/indicators?*", (req) => {
      expect(req.query).to.deep.equal({
        start_date: "2026-10-01",
        end_date: "2026-10-24",
        account_status: "active",
        candidate_availability: "available",
        company_status: "approved",
        job_status: "published",
        application_status: "hired",
      });
      req.reply({
        ...summary,
        totals: { ...summary.totals, applications: 1 },
        filters: req.query,
      });
    }).as("filteredIndicators");
    cy.contains("button", "Aplicar filtros").click();
    cy.wait("@filteredIndicators");
    cy.get('[data-indicator="applications"]').should("have.text", "1");
    cy.get('[data-indicator="matches"]').should("have.text", "2");
    cy.injectAxe();
    cy.checkA11y("main", wcag);
    cy.screenshot("dashboard-desktop", { capture: "fullPage" });
    cy.contains("button", "Limpar filtros").click();
    cy.get("#dashboard-start").should("have.value", "");
    cy.get('[data-indicator="applications"]').should("have.text", "2");
    cy.contains("a", "Cadastros").click();
    cy.contains("a", "Relatórios").click();
    cy.contains("h1", "Relatórios da plataforma").should("be.visible");
  });

  it("distinguishes loading, failure, retry and an empty successful result", () => {
    let attempts = 0;
    cy.intercept("GET", "**/indicators*", (req) => {
      attempts += 1;
      if (attempts === 1)
        req.reply({
          statusCode: 503,
          delay: 1000,
          body: {
            status: 503,
            title: "Unavailable",
            code: "service_unavailable",
          },
        });
      else
        req.reply({
          ...summary,
          totals: {
            candidates: 0,
            companies: 0,
            jobs: 0,
            applications: 0,
            matches: 0,
          },
          segments: {
            candidates_without_placement: 0,
            candidates_with_unknown_employment: 0,
            incomplete_resumes: 0,
          },
        });
    });
    signIn();
    cy.contains('[role="status"]', "Carregando indicadores...").should(
      "be.visible",
    );
    cy.get('[role="alert"]').should(
      "contain.text",
      "Não foi possível carregar",
    );
    cy.get('[data-indicator="matches"]').should("not.exist");
    cy.contains("button", "Tentar novamente").click();
    cy.contains("Nenhum registro encontrado com estes filtros.").should(
      "be.visible",
    );
    cy.get('[data-indicator="matches"]').should("have.text", "0");
  });

  it("reports a reversed period accessibly before sending it", () => {
    let requests = 0;
    cy.intercept("GET", "**/indicators*", (req) => {
      requests += 1;
      req.reply(summary);
    });
    signIn();
    cy.get('[data-indicator="matches"]').should("have.text", "2");
    cy.get("#dashboard-start").type("2026-10-24");
    cy.get("#dashboard-end").type("2026-10-01");
    cy.contains("button", "Aplicar filtros").click();
    cy.get('[role="alert"]').should("contain.text", "data inicial");
    cy.get("#dashboard-start").should("have.attr", "aria-invalid", "true");
    cy.then(() => expect(requests).to.equal(1));
    cy.injectAxe();
    cy.checkA11y("main", wcag);
  });

  it("downloads the applied filters as a CSV file", () => {
    cy.intercept("GET", "**/indicators*", { body: summary });
    cy.intercept("GET", "**/indicators/export*", {
      body: "﻿Item;Valor\r\nStatus das vagas;Publicada\r\n",
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition":
          'attachment; filename="relatorios-2026-10-26.csv"',
      },
    }).as("export");
    signIn();
    cy.get("#dashboard-job-status").select("published");
    cy.contains("button", "Aplicar filtros").click();

    cy.contains("button", "Exportar dados").click();

    cy.wait("@export")
      .its("request.url")
      .should("match", /\/indicators\/export\?job_status=published$/);
    cy.contains('[role="status"]', "Arquivo CSV exportado.").should(
      "be.visible",
    );
    cy.contains("button", "Exportar dados").should("have.focus");
    cy.readFile(
      `${Cypress.config("downloadsFolder")}/relatorios-2026-10-26.csv`,
    ).should("contain", "Status das vagas;Publicada");
    cy.injectAxe();
    cy.checkA11y("main", wcag);
  });

  it("keeps the dashboard usable by keyboard and within narrow viewports", () => {
    cy.intercept("GET", "**/indicators*", { body: summary });
    signIn();
    cy.get('[data-indicator="matches"]').should("have.text", "2");
    cy.get("#dashboard-start").focus().realPress("Tab");
    // Native date inputs have multiple segments; the focus must remain visible
    // within the form rather than being trapped by a custom widget.
    cy.focused().should("be.visible");
    for (const width of [320, 390, 768, 1024, 1280]) {
      cy.viewport(width, 900);
      cy.document().then((doc) =>
        expect(doc.documentElement.scrollWidth).to.be.at.most(
          doc.documentElement.clientWidth,
        ),
      );
      cy.injectAxe();
      cy.checkA11y("main", wcag);
    }
    cy.viewport(390, 900);
    cy.screenshot("dashboard-mobile", { capture: "fullPage" });
  });
});
