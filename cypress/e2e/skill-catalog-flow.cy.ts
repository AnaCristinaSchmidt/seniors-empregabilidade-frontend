// US-06-T04 browser flow across the administrator, candidate and company
// screens. The fake API keeps one catalog, résumé and job in memory and applies
// the backend rules (docs/SKILL_CATALOG.md in the backend): inactive skills leave
// GET /skills, stay on the résumé that has them, cannot be selected anew, and
// still count towards compatibility. PostgreSQL tests in the backend cover the
// real implementation.
const ADMIN_ID = "61000000-0000-4000-8000-000000000001";
const CANDIDATE_ID = "61000000-0000-4000-8000-000000000002";
const COMPANY_ID = "61000000-0000-4000-8000-000000000003";
const JOB_ID = "61000000-0000-4000-8000-000000000004";
const APPLICATION_ID = "61000000-0000-4000-8000-000000000005";
const JOB_TITLE = "Operador de logística";
const WCAG = {
  runOnly: {
    type: "tag" as const,
    values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
  },
};

type Role = "admin" | "candidate" | "company";
type CatalogSkill = {
  id: string;
  name: string;
  type: "hard" | "soft";
  active: boolean;
};

const forklift: CatalogSkill = {
  id: "65000000-0000-4000-8000-000000000001",
  name: "Operação de empilhadeira",
  type: "hard",
  active: true,
};
const excel: CatalogSkill = {
  id: "65000000-0000-4000-8000-000000000002",
  name: "Excel",
  type: "hard",
  active: true,
};
const teamwork: CatalogSkill = {
  id: "65000000-0000-4000-8000-000000000003",
  name: "Trabalho em grupo",
  type: "soft",
  active: true,
};

function comparable(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function asSkill({ id, name, type }: CatalogSkill) {
  return { id, name, type };
}

function asEntry(skill: CatalogSkill) {
  return {
    ...asSkill(skill),
    status: skill.active ? "active" : "inactive",
  };
}

const usersByToken: Record<string, { id: string; user_type: string }> = {
  "Bearer skills-flow-admin": { id: ADMIN_ID, user_type: "administrator" },
  "Bearer skills-flow-candidate": { id: CANDIDATE_ID, user_type: "candidate" },
  "Bearer skills-flow-company": { id: COMPANY_ID, user_type: "company" },
};

/** Serves every screen of the flow from one in-memory backend. */
function fakeApi(resumeSkillIds: string[]) {
  const catalog = [forklift, excel, teamwork].map((skill) => ({ ...skill }));
  const required = [forklift.id];
  let resume = [...resumeSkillIds];
  const byId = (id: string) => catalog.find((skill) => skill.id === id);
  const named = (ids: string[]) =>
    ids
      .map((id) => byId(id))
      .filter((skill): skill is CatalogSkill => skill !== undefined)
      .sort((left, right) => left.name.localeCompare(right.name));
  const profile = () => ({
    id: CANDIDATE_ID,
    full_name: "Pessoa Sintética",
    age: 58,
    email: "candidate@example.invalid",
    phone: "51999990000",
    city: "Porto Alegre",
    state: "RS",
    summary: null,
    experiences: [],
    education: [],
    skills: named(resume).map(asSkill),
  });

  cy.intercept("GET", "**/auth/me", (request) => {
    const user = usersByToken[String(request.headers.authorization)];
    request.reply({
      ...user,
      company_status: user?.user_type === "company" ? "approved" : null,
    });
  });

  cy.intercept("GET", "**/admin/skills?*", (request) => {
    const search = comparable(String(request.query.search ?? ""));
    const status = request.query.status;
    const items = named(catalog.map((skill) => skill.id))
      .filter((skill) => comparable(skill.name).includes(search))
      .filter((skill) => !status || asEntry(skill).status === status)
      .map(asEntry);
    request.reply({ items, total: items.length });
  }).as("adminCatalog");
  cy.intercept("PATCH", "**/admin/skills/*", (request) => {
    const skill = byId(request.url.split("/").pop() ?? "");
    if (!skill) throw new Error("The flow only changes catalog skills.");
    const { status } = request.body as { status: "active" | "inactive" };
    skill.active = status === "active";
    request.reply(asEntry(skill));
  }).as("changeStatus");

  // Anchored so it leaves GET /admin/skills to the administrator's catalog.
  cy.intercept({ method: "GET", pathname: /\/api\/v1\/skills$/ }, (request) => {
    const search = comparable(String(request.query.search ?? ""));
    request.reply(
      named(catalog.map((skill) => skill.id))
        .filter((skill) => skill.active)
        .filter((skill) => comparable(skill.name).includes(search))
        .map(asSkill),
    );
  }).as("catalog");
  cy.intercept("GET", "**/professionals/me", (request) =>
    request.reply(profile()),
  ).as("profile");
  cy.intercept("PUT", "**/professionals/me/skills", (request) => {
    const { skill_ids } = request.body as { skill_ids: string[] };
    const unavailable = skill_ids.some((id) => {
      const skill = byId(id);
      return !skill || (!skill.active && !resume.includes(id));
    });
    if (unavailable) {
      request.reply({
        statusCode: 404,
        body: {
          title: "Not Found",
          status: 404,
          detail: "The skill was not found.",
          code: "skill_not_found",
        },
      });
      return;
    }
    resume = [...new Set(skill_ids)];
    request.reply(named(resume).map(asSkill));
  }).as("replaceSkills");
  cy.intercept("PATCH", "**/professionals/me", (request) =>
    request.reply({ ...profile(), ...(request.body as object) }),
  ).as("saveProfile");

  cy.intercept("GET", "**/jobs/me", [
    {
      id: JOB_ID,
      company_id: COMPANY_ID,
      title: JOB_TITLE,
      description: "Vaga sintética.",
      skills: named(required).map(asSkill),
      work_mode: "onsite",
      closing_date: "2099-12-31",
      status: "published",
      published_at: "2026-10-01T12:00:00Z",
      created_at: "2026-10-01T12:00:00Z",
      application_count: 1,
    },
  ]);
  // Compatibility compares catalog ids and ignores whether a skill is active.
  cy.intercept("GET", `**/jobs/${JOB_ID}/applications`, (request) => {
    const matched = required.filter((id) => resume.includes(id));
    const missing = required.filter((id) => !resume.includes(id));
    const percentage = (matched.length / required.length) * 100;
    request.reply({
      job_id: JOB_ID,
      total_applicant_count: 1,
      full_match_count: missing.length === 0 ? 1 : 0,
      automatic_match_count: 0,
      applicants: [
        {
          origin: "application",
          application_id: APPLICATION_ID,
          status: "applied",
          match_score: null,
          compatibility_percentage: percentage.toFixed(2),
          is_highlighted: percentage >= 50,
          matched_skill_count: matched.length,
          required_skill_count: required.length,
          matched_skills: named(matched).map(({ id, name }) => ({ id, name })),
          missing_skills: named(missing).map(({ id, name }) => ({ id, name })),
          profile: {
            candidate_id: CANDIDATE_ID,
            full_name: "Pessoa Sintética",
            city: "Porto Alegre",
            state: "RS",
          },
        },
      ],
    });
  }).as("applicants");

  return {
    /** An administrator inactivating the skill from another session. */
    inactivate(id: string) {
      const skill = byId(id);
      if (skill) skill.active = false;
    },
  };
}

function visitAs(role: Role, path: string) {
  cy.visit(path, {
    onBeforeLoad(window) {
      window.sessionStorage.setItem(
        "seniors.access-token",
        `skills-flow-${role}`,
      );
    },
  });
}

function openProfileEditor() {
  visitAs("candidate", "/candidato/perfil");
  cy.wait("@profile");
  cy.contains("button", "Editar perfil").click();
  cy.get('[role="dialog"]').should("have.css", "opacity", "1");
  cy.wait("@catalog");
}

function searchCatalog(term: string) {
  cy.get('[role="dialog"]').contains("label", "Buscar no catálogo").click();
  cy.focused().clear().type(term);
}

function profileSkills() {
  return cy.contains("h3", "Habilidades").parent();
}

function companyCompatibility() {
  visitAs("company", `/empresa/candidatos?jobId=${JOB_ID}`);
  cy.wait("@applicants");
  cy.contains(`Candidatos — ${JOB_TITLE}`).should("be.visible");
  return cy.contains("article", "Pessoa Sintética");
}

describe("skill catalog from the administrator to the match", () => {
  it("shows a selected skill on the profile and in the company's compatibility", () => {
    fakeApi([teamwork.id]);
    companyCompatibility().within(() => {
      cy.contains("Atende 0 de 1 requisitos").should("be.visible");
      cy.contains("Falta: Operação de empilhadeira.").should("be.visible");
    });

    openProfileEditor();
    searchCatalog("empilhadeira");
    cy.contains('[role="status"]', "1 habilidade encontrada.");
    cy.get('[aria-label="Catálogo de habilidades"]')
      .contains("button", "Operação de empilhadeira")
      .click();
    cy.contains("button", "Salvar alterações").click();
    cy.wait("@replaceSkills")
      .its("request.body.skill_ids")
      .should("have.members", [teamwork.id, forklift.id]);
    cy.wait("@saveProfile");
    cy.get('[role="dialog"]').should("not.exist");
    profileSkills().within(() => {
      cy.contains("Operação de empilhadeira").should("be.visible");
      cy.contains("Trabalho em grupo").should("be.visible");
    });

    companyCompatibility().within(() => {
      cy.contains("Atende 1 de 1 requisitos").should("be.visible");
      cy.contains("Atende: Operação de empilhadeira.").should("be.visible");
      cy.contains("Falta:").should("not.exist");
    });
  });

  it("withdraws an inactivated skill from selection but keeps it on the profile and in the match", () => {
    fakeApi([forklift.id]);
    visitAs("admin", "/administrador/competencias");
    cy.wait("@adminCatalog");
    cy.get('button[aria-label="Inativar Operação de empilhadeira"]').click();
    cy.get('[role="alertdialog"]')
      .contains("button", /^Inativar competência$/)
      .click();
    cy.wait("@changeStatus")
      .its("request.body")
      .should("deep.equal", { status: "inactive" });
    cy.get('button[aria-label="Reativar Operação de empilhadeira"]').should(
      "exist",
    );

    openProfileEditor();
    // The résumé keeps the inactive skill it already had.
    cy.get('[aria-label="Remover habilidade Operação de empilhadeira"]')
      .scrollIntoView()
      .should("be.visible");
    searchCatalog("empilhadeira");
    cy.contains(
      '[role="status"]',
      "Nenhuma habilidade encontrada para “empilhadeira”.",
    );
    searchCatalog("excel");
    cy.get('[aria-label="Catálogo de habilidades"]')
      .contains("button", "Excel")
      .click();
    cy.injectAxe();
    cy.checkA11y('[role="dialog"]', WCAG);
    cy.contains("button", "Salvar alterações").click();
    cy.wait("@replaceSkills")
      .its("request.body.skill_ids")
      .should("have.members", [forklift.id, excel.id]);
    cy.wait("@saveProfile");
    cy.get('[role="dialog"]').should("not.exist");
    profileSkills().within(() => {
      cy.contains("Operação de empilhadeira").should("be.visible");
      cy.contains("Excel").should("be.visible");
    });

    companyCompatibility().within(() => {
      cy.contains("Atende 1 de 1 requisitos").should("be.visible");
      cy.contains("Atende: Operação de empilhadeira.").should("be.visible");
    });
  });

  it("keeps the draft when a chosen skill is inactivated before saving", () => {
    cy.viewport(390, 844);
    const api = fakeApi([teamwork.id]);
    openProfileEditor();
    searchCatalog("empilhadeira");
    cy.get('[aria-label="Catálogo de habilidades"]')
      .contains("button", "Operação de empilhadeira")
      .click();
    cy.then(() => api.inactivate(forklift.id));

    cy.contains("button", "Salvar alterações").click();

    cy.wait("@replaceSkills").its("response.statusCode").should("eq", 404);
    cy.get('[role="dialog"]')
      .find('[role="alert"]')
      .should("be.visible")
      .and(
        "contain.text",
        "Uma das habilidades escolhidas não está mais disponível.",
      );
    cy.get("@saveProfile.all").should("have.length", 0);
    cy.get(
      '[aria-label="Remover habilidade Operação de empilhadeira"]',
    ).click();
    cy.contains("button", "Salvar alterações").click();
    // Back to the saved selection: only the profile fields are sent.
    cy.wait("@saveProfile");
    cy.get("@replaceSkills.all").should("have.length", 1);
    cy.get('[role="dialog"]').should("not.exist");
    profileSkills().within(() => {
      cy.contains("Trabalho em grupo").should("be.visible");
      cy.contains("Operação de empilhadeira").should("not.exist");
    });
  });
});
