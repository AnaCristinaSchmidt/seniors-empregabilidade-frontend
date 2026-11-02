// US-21 browser flow. The API keeps a synthetic application in memory across
// company/candidate sessions; PostgreSQL lifecycle tests cover the real backend.
const COMPANY_ID = "11111111-1111-4111-8111-111111111111";
const CANDIDATE_ID = "22222222-2222-4222-8222-222222222222";
const JOB_ID = "33333333-3333-4333-8333-333333333333";
const APPLICATION_ID = "44444444-4444-4444-8444-444444444444";
const SKILL_ID = "55555555-5555-4555-8555-555555555555";
const TITLE = "Analista de operações";
const WCAG = {
  runOnly: {
    type: "tag" as const,
    values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
  },
};

function fakeApi() {
  let status = "under_review";
  let reason: string | null = null;
  const job = {
    id: JOB_ID,
    company_id: COMPANY_ID,
    title: TITLE,
    description: "Vaga sintética.",
    skills: [],
    work_mode: "remote",
    closing_date: "2099-12-31",
    status: "published",
    published_at: "2026-10-01T12:00:00Z",
    created_at: "2026-10-01T12:00:00Z",
    application_count: 1,
  };
  cy.intercept("GET", "**/auth/me", (request) => {
    const company = request.headers.authorization === "Bearer us21-company";
    request.reply({
      statusCode: 200,
      body: {
        id: company ? COMPANY_ID : CANDIDATE_ID,
        user_type: company ? "company" : "candidate",
        company_status: company ? "approved" : null,
      },
    });
  });
  cy.intercept("GET", "**/jobs/me", { statusCode: 200, body: [job] });
  cy.intercept("GET", `**/jobs/${JOB_ID}/applications`, (request) =>
    request.reply({
      statusCode: 200,
      body: {
        job_id: JOB_ID,
        total_applicant_count: 1,
        full_match_count: 1,
        automatic_match_count: 1,
        applicants: [
          {
            origin: "application",
            application_id: APPLICATION_ID,
            status,
            match_score: null,
            compatibility_percentage: "100.00",
            is_highlighted: true,
            matched_skill_count: 1,
            required_skill_count: 1,
            matched_skills: [{ id: SKILL_ID, name: "Excel" }],
            missing_skills: [],
            profile: {
              candidate_id: CANDIDATE_ID,
              full_name: "Pessoa Exemplo",
              city: "Porto Alegre",
              state: "RS",
            },
          },
          {
            origin: "automatic_match",
            application_id: null,
            status: null,
            match_score: null,
            compatibility_percentage: "100.00",
            is_highlighted: true,
            matched_skill_count: 1,
            required_skill_count: 1,
            profile: {
              candidate_id: SKILL_ID,
              full_name: "Perfil automático",
              city: null,
              state: null,
            },
          },
        ],
      },
    }),
  ).as("applicants");
  cy.intercept("GET", `**/applications/${APPLICATION_ID}/profile`, {
    statusCode: 200,
    body: {
      application_id: APPLICATION_ID,
      candidate_id: CANDIDATE_ID,
      full_name: "Pessoa Exemplo",
      city: "Porto Alegre",
      state: "RS",
      summary: "Experiência sintética em operações.",
      skills: [{ id: SKILL_ID, name: "Excel", type: "hard" }],
      experiences: [],
      education: [],
      certifications: [],
    },
  });
  cy.intercept(
    "PATCH",
    `**/applications/${APPLICATION_ID}/status`,
    (request) => {
      const change = request.body as { status: string; reason?: string };
      status = change.status;
      reason = change.reason ?? null;
      request.reply({
        statusCode: 200,
        body: {
          application_id: APPLICATION_ID,
          job_id: JOB_ID,
          candidate_id: CANDIDATE_ID,
          status,
          updated_at: "2026-10-26T12:00:00Z",
        },
      });
    },
  ).as("changeStatus");
  cy.intercept("GET", /\/applications\/me(\?|$)/, (request) =>
    request.reply({
      statusCode: 200,
      body: [
        {
          id: APPLICATION_ID,
          job_id: JOB_ID,
          job_title: TITLE,
          company_name: "Empresa Exemplo",
          submitted_at: "2026-10-01T12:00:00Z",
          days_in_process: 1,
          status,
          reason,
          similar_jobs: [],
        },
      ],
    }),
  ).as("myApplications");
}

function visitAs(role: "company" | "candidate", path: string) {
  cy.visit(path, {
    onBeforeLoad(window) {
      window.sessionStorage.setItem("seniors.access-token", `us21-${role}`);
    },
  });
}
function switchToCandidate() {
  cy.contains("button", "Sair").click();
  cy.location("pathname").should("eq", "/login");
  visitAs("candidate", "/candidato/candidaturas");
  cy.wait("@myApplications");
}

describe("company candidate management", () => {
  it("opens profiles, rejects with a reason, and shows that decision to the candidate", () => {
    fakeApi();
    visitAs("company", "/empresa/vagas");
    cy.contains("a", "Gerenciar candidatos").click();
    cy.location("pathname").should("eq", "/empresa/candidatos");
    cy.wait("@applicants");
    cy.contains("Candidatos — Analista de operações").should("be.visible");
    cy.contains("1 candidatos · 1 atendem a todos os requisitos").should(
      "be.visible",
    );
    cy.contains("1 perfis com match automático, sem candidatura.").should(
      "be.visible",
    );
    cy.contains("Perfil automático").should("not.exist");
    cy.injectAxe();
    cy.checkA11y(undefined, WCAG);
    cy.contains("button", "Ver perfil").click();
    cy.get('[role="alertdialog"]').should("have.css", "opacity", "1");
    cy.contains("Experiência sintética em operações.").should("be.visible");
    cy.screenshot("us21-applicant-profile", { capture: "viewport" });
    cy.checkA11y(undefined, WCAG);
    cy.contains("button", "Fechar").click();
    cy.get('[role="alertdialog"]').should("not.exist");
    cy.contains("button", "Não selecionar").click();
    cy.get('[role="alertdialog"]').should("have.css", "opacity", "1");
    cy.contains("button", "Confirmar").should("be.disabled");
    cy.contains("label", "Motivo para o candidato")
      .find("textarea")
      .type("Perfil não alinhado aos requisitos.");
    cy.checkA11y(undefined, WCAG);
    cy.contains("button", "Confirmar").click();
    cy.wait("@changeStatus").its("request.body").should("deep.equal", {
      status: "not_selected",
      reason: "Perfil não alinhado aos requisitos.",
    });
    cy.get('[role="alertdialog"]').should("not.exist");
    cy.contains("Status atualizado para Não selecionado.").should("be.visible");
    switchToCandidate();
    cy.contains("Motivo: Perfil não alinhado aos requisitos.").should(
      "be.visible",
    );
    cy.contains("button", "Sair do processo").should("not.exist");
    cy.injectAxe();
    cy.checkA11y(undefined, WCAG);
  });

  it("advances and selects an applicant and shows the result to the candidate on mobile", () => {
    cy.viewport(390, 844);
    fakeApi();
    visitAs("company", `/empresa/candidatos?jobId=${JOB_ID}`);
    cy.wait("@applicants");
    cy.contains("button", "Avançar para seleção").click();
    cy.wait("@changeStatus")
      .its("request.body")
      .should("deep.equal", { status: "in_selection_process" });
    cy.contains("button", /^Selecionar$/).click();
    cy.contains("button", "Confirmar").click();
    cy.wait("@changeStatus")
      .its("request.body")
      .should("deep.equal", { status: "hired" });
    cy.contains("Status atualizado para Selecionado.").should("be.visible");
    cy.contains("button", "Avançar para seleção").should("not.exist");
    cy.injectAxe();
    cy.checkA11y(undefined, WCAG);
    switchToCandidate();
    cy.contains(TITLE).should("be.visible");
    cy.contains("button", "Sair do processo").should("not.exist");
    cy.contains("Motivo:").should("not.exist");
    cy.get("body").then(($body) =>
      expect($body[0]?.scrollWidth).to.be.at.most(390),
    );
  });
});
