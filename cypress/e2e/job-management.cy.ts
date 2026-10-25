// US-18 end to end: the company edits, closes and reopens a job in "Minhas
// vagas", and the candidate search (US-10) follows. The fake API keeps one job
// in memory and answers both roles as docs/JOBS.md and docs/JOB_SEARCH.md in
// the backend repository describe; the backend tests cover the real one.

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";
const CANDIDATE_ID = "55555555-5555-4555-8555-555555555555";
const JOB_ID = "22222222-2222-4222-8222-222222222222";
const TITLE = "Analista de operações";
const EDITED_TITLE = "Analista de operações sênior";
const WCAG = {
  runOnly: {
    type: "tag" as const,
    values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
  },
};

const accounts = {
  company: {
    token: "e2e-company-token",
    id: COMPANY_ID,
    user_type: "company",
    company_status: "approved",
  },
  candidate: {
    token: "e2e-candidate-token",
    id: CANDIDATE_ID,
    user_type: "candidate",
    company_status: null,
  },
} as const;

type Role = keyof typeof accounts;

interface FakeSkill {
  id: string;
  name: string;
  type: string;
}

function fakeApi(): void {
  const job = {
    id: JOB_ID,
    company_id: COMPANY_ID,
    title: TITLE,
    description: "Vaga sintética para o teste de ponta a ponta.",
    skills: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        name: "Excel",
        type: "hard",
      },
      {
        id: "44444444-4444-4444-8444-444444444444",
        name: "Gestão de equipes",
        type: "soft",
      },
    ] as FakeSkill[],
    work_mode: "hybrid",
    closing_date: "2099-12-31",
    status: "published",
    published_at: "2026-09-23T12:00:00Z",
    created_at: "2026-09-23T12:00:00Z",
  };
  let createdSkills = 0;

  cy.intercept("GET", "**/auth/me", (request) => {
    const account =
      request.headers.authorization === `Bearer ${accounts.company.token}`
        ? accounts.company
        : accounts.candidate;
    request.reply({
      statusCode: 200,
      body: {
        id: account.id,
        user_type: account.user_type,
        company_status: account.company_status,
      },
    });
  }).as("currentUser");
  cy.intercept(
    { method: "GET", pathname: "/api/v1/skills" },
    { statusCode: 200, body: [] },
  );

  cy.intercept({ method: "GET", pathname: "/api/v1/jobs/me" }, (request) =>
    request.reply({
      statusCode: 200,
      body: [{ ...job, application_count: 2 }],
    }),
  ).as("myJobs");
  cy.intercept(
    { method: "PATCH", pathname: `/api/v1/jobs/${JOB_ID}` },
    (request) => {
      const body = request.body as {
        title: string;
        description: string;
        skills: { name: string; type: string }[];
      };
      job.title = body.title;
      job.description = body.description;
      job.skills = body.skills.map(
        ({ name, type }) =>
          job.skills.find((skill) => skill.name === name) ?? {
            id: `66666666-6666-4666-8666-${String(++createdSkills).padStart(12, "0")}`,
            name,
            type,
          },
      );
      request.reply({ statusCode: 200, body: job });
    },
  ).as("editJob");
  cy.intercept(
    { method: "PATCH", pathname: `/api/v1/jobs/${JOB_ID}/status` },
    (request) => {
      const { status } = request.body as { status: string };
      job.status = status === "closed" ? "closed" : "published";
      request.reply({ statusCode: 200, body: job });
    },
  ).as("changeStatus");

  // The closing date is far ahead, so the job is open while it is published.
  cy.intercept({ method: "GET", pathname: "/api/v1/jobs" }, (request) => {
    const search = (
      new URL(request.url).searchParams.get("search") ?? ""
    ).toLowerCase();
    const found =
      job.status === "published" && job.title.toLowerCase().includes(search);
    request.reply({
      statusCode: 200,
      headers: { "cache-control": "no-store" },
      body: found
        ? [
            {
              id: job.id,
              title: job.title,
              company_name: "Empresa Sintética",
              location: null,
              work_mode: job.work_mode,
              salary_max: null,
              published_at: job.published_at,
              days_since_published: 3,
              matched_skill_count: 0,
              required_skill_count: job.skills.length,
              missing_skills: job.skills,
            },
          ]
        : [],
    });
  }).as("searchJobs");
}

function visitRoleArea(role: Role): void {
  cy.visit(role === "company" ? "/empresa" : "/candidato", {
    onBeforeLoad(window) {
      window.sessionStorage.setItem(
        "seniors.access-token",
        accounts[role].token,
      );
    },
  });
  cy.wait("@currentUser")
    .its("request.headers.authorization")
    .should("eq", `Bearer ${accounts[role].token}`);
  cy.contains(
    "h1",
    role === "company" ? "Área da empresa" : "Área do candidato",
  ).should("be.visible");
}

function signOut(): void {
  cy.contains("button", "Sair").click();
  cy.location("pathname").should("eq", "/login");
}

function openMyJobs(): void {
  cy.contains("a", "Minhas vagas").click();
  cy.location("pathname").should("eq", "/empresa/vagas");
  cy.wait("@myJobs");
}

function searchAsCandidate(): void {
  cy.contains("a", /^Vagas$/).click();
  cy.location("pathname").should("eq", "/candidato/vagas");
  cy.wait("@searchJobs");
}

// The form generates its ids, so fields are found by their label.
function field(label: string): Cypress.Chainable<JQuery<HTMLElement>> {
  return cy
    .contains("label", label)
    .invoke("attr", "for")
    .then((id) => cy.get(`[id="${id}"]`));
}

describe("job management", () => {
  it("blocks saving a job without title or skill, then shows the edit in Minhas vagas", () => {
    fakeApi();
    visitRoleArea("company");
    openMyJobs();
    cy.injectAxe();

    cy.contains("article", TITLE).within(() => {
      cy.contains("button", "Editar").click();
    });
    // axe measures contrast mid fade-in otherwise.
    cy.get('[role="dialog"]').should("have.css", "opacity", "1");
    field("Título da vaga").should("have.value", TITLE).clear();
    cy.get('button[aria-label="Remover habilidade Excel"]').click();
    cy.get('button[aria-label="Remover habilidade Gestão de equipes"]').click();
    cy.contains("button", "Salvar").click();

    field("Título da vaga")
      .invoke("attr", "aria-describedby")
      .then((id) => cy.get(`[id="${id}"]`))
      .should("have.text", "Preencha este campo.");
    cy.contains("Adicione pelo menos uma habilidade.")
      .scrollIntoView()
      .should("be.visible");
    cy.get("@editJob.all").should("have.length", 0);
    cy.checkA11y(undefined, WCAG);

    field("Título da vaga").type(EDITED_TITLE);
    cy.contains("label", "Comportamental").click();
    field("Habilidades necessárias").type("Liderança{enter}");
    cy.contains("button", "Salvar").click();

    cy.wait("@editJob")
      .its("request.body")
      .should("deep.equal", {
        title: EDITED_TITLE,
        description: "Vaga sintética para o teste de ponta a ponta.",
        skills: [{ name: "Liderança", type: "soft" }],
      });
    cy.get('[role="dialog"]').should("not.exist");
    cy.contains(`A vaga “${EDITED_TITLE}” foi atualizada.`).should(
      "be.visible",
    );
    cy.contains("article", EDITED_TITLE).within(() => {
      cy.contains("li", "Liderança").should("be.visible");
      cy.contains("li", "Excel").should("not.exist");
    });
    cy.checkA11y(undefined, WCAG);
  });

  it("takes a closed job out of the candidate search and brings it back when reopened", () => {
    fakeApi();
    visitRoleArea("company");
    openMyJobs();
    cy.contains("article", TITLE).within(() => {
      cy.contains("button", "Encerrar").click();
    });
    cy.get('[role="alertdialog"]').within(() => {
      cy.contains("button", "Encerrar vaga").click();
    });
    cy.wait("@changeStatus")
      .its("request.body")
      .should("deep.equal", { status: "closed" });
    cy.contains("article", TITLE).within(() => {
      cy.contains("Encerrada").should("be.visible");
      cy.contains("button", "Reabrir").should("be.visible");
    });

    signOut();
    visitRoleArea("candidate");
    searchAsCandidate();
    cy.contains("Nenhuma vaga encontrada").should("be.visible");
    cy.contains("h2", TITLE).should("not.exist");

    signOut();
    visitRoleArea("company");
    openMyJobs();
    cy.contains("article", TITLE).within(() => {
      cy.contains("button", "Reabrir").click();
    });
    cy.wait("@changeStatus")
      .its("request.body")
      .should("deep.equal", { status: "open" });
    cy.contains(
      `A vaga “${TITLE}” foi reaberta e voltou às buscas dos candidatos.`,
    ).should("be.visible");

    signOut();
    visitRoleArea("candidate");
    searchAsCandidate();
    cy.contains("1 vaga encontrada").should("be.visible");
    cy.contains("h2", TITLE).should("be.visible");
  });
});
