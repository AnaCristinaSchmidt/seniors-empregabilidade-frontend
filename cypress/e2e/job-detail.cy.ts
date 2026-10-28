// Keep this HTTP fixture independent of application types: Cypress uses its own TypeScript project.
const jobDetail = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Operations supervisor",
  description: "Coordinate daily operations and support the team.",
  company_id: "22222222-2222-4222-8222-222222222222",
  company_name: "Example Company",
  skills: [
    {
      id: "33333333-3333-4333-8333-333333333333",
      name: "Spreadsheets",
      type: "hard",
    },
    {
      id: "44444444-4444-4444-8444-444444444444",
      name: "Teamwork",
      type: "soft",
    },
  ],
  work_mode: "hybrid",
  location: "Example City",
  closing_date: "2026-12-31",
  status: "published",
  published_at: "2026-10-01T12:00:00Z",
  already_applied: false,
  is_open: true,
  is_expired: false,
  is_applicable: true,
};

const wcag = {
  runOnly: {
    type: "tag" as const,
    values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
  },
};

describe("candidate job detail", () => {
  let detail = { ...jobDetail };

  beforeEach(() => {
    detail = { ...jobDetail };
    cy.intercept("GET", "**/auth/me", {
      body: {
        id: "77777777-7777-4777-8777-777777777777",
        user_type: "candidate",
        company_status: null,
      },
    });
    cy.intercept("GET", "**/config/support", { statusCode: 404, body: {} });
    cy.intercept(
      { method: "GET", pathname: "/api/v1/jobs" },
      {
        body: [
          {
            id: jobDetail.id,
            title: jobDetail.title,
            company_name: jobDetail.company_name,
            location: jobDetail.location,
            work_mode: jobDetail.work_mode,
            salary_max: null,
            published_at: jobDetail.published_at,
            days_since_published: 1,
            matched_skill_count: 1,
            required_skill_count: 2,
            missing_skills: [jobDetail.skills[1]],
          },
        ],
      },
    ).as("search");
    cy.intercept("GET", `**/jobs/${jobDetail.id}`, (request) => {
      request.reply({ body: detail, delay: 150 });
    }).as("detail");
    cy.intercept(
      "POST",
      `**/job-postings/${jobDetail.id}/applications`,
      (request) => {
        detail = { ...detail, already_applied: true, is_applicable: false };
        request.reply({
          statusCode: 201,
          body: { id: "88888888-8888-4888-8888-888888888888" },
        });
      },
    ).as("apply");
    cy.visit("/candidato/vagas", {
      onBeforeLoad(window) {
        window.sessionStorage.setItem(
          "seniors.access-token",
          "synthetic-test-token",
        );
      },
    });
    cy.wait("@search");
  });

  function openDetail(): void {
    cy.contains("button", "Ver vaga")
      .focus()
      .should("be.focused")
      .realPress("Enter");
    cy.get('[role="dialog"]').should("be.visible");
    cy.wait("@detail");
    cy.get('[role="dialog"] h2').should("have.text", jobDetail.title);
    cy.get('[role="dialog"]').should("have.css", "opacity", "1");
  }

  it("opens with the keyboard, checks accessibility, applies and rereads the application state", () => {
    openDetail();
    cy.injectAxe();
    cy.checkA11y('[role="dialog"]', wcag);
    cy.get('[role="dialog"]').within(() => {
      cy.contains(jobDetail.description).should("be.visible");
      cy.contains("Spreadsheets").should("be.visible");
      cy.get('time[datetime="2026-12-31"]').should("have.text", "31/12/2026");
      cy.contains("button", "Candidatar-se").click();
    });
    cy.wait("@apply");
    cy.contains("Candidatura enviada").should("be.visible");
    cy.contains("button", "Já candidatado").should("be.disabled");
    cy.realPress("Escape");
    cy.get('[role="dialog"]').should("not.exist");
    cy.contains("button", "Ver vaga").should("be.focused");
    openDetail();
    cy.contains("button", "Já candidatado").should("be.disabled");
    cy.contains("Candidatura enviada").should("not.exist");
  });

  for (const { label, ...state } of [
    { status: "closed", is_expired: false, label: "Vaga encerrada" },
    { status: "paused", is_expired: false, label: "Vaga pausada" },
    { status: "expired", is_expired: true, label: "Vaga expirada" },
    { status: "published", is_expired: true, label: "Vaga expirada" },
  ]) {
    it(`keeps a ${state.status} job readable and disables applying`, () => {
      detail = { ...detail, ...state, is_open: false, is_applicable: false };
      openDetail();
      cy.contains("button", label).should("be.disabled");
      cy.get("@apply.all").should("have.length", 0);
    });
  }

  it("keeps long descriptions and the footer reachable on a narrow viewport", () => {
    cy.viewport(390, 640);
    detail = {
      ...detail,
      description: "Synthetic description for reflow checks. ".repeat(100),
    };
    openDetail();
    cy.get('[role="dialog"]').then(($dialog) => {
      const dialog = $dialog[0]!;
      expect(dialog.scrollHeight).to.be.greaterThan(dialog.clientHeight);
      expect(dialog.scrollWidth).to.be.at.most(dialog.clientWidth);
      expect(dialog.getBoundingClientRect().height).to.be.at.most(608);
    });
    cy.get('[role="dialog"]').scrollTo("bottom");
    cy.contains("button", "Candidatar-se")
      .should("be.visible")
      .and("be.enabled");
    cy.injectAxe();
    cy.checkA11y('[role="dialog"]', wcag);
    cy.screenshot("job-detail-mobile", { capture: "viewport" });
    cy.realPress("Escape");
    cy.get('[role="dialog"]').should("not.exist");
    cy.contains("button", "Ver vaga").should("be.focused");
  });
});
