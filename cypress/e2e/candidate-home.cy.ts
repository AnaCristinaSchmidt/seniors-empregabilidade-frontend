// HTTP fixtures follow the backend contract of US-32-T01 (docs/CANDIDATE_HOME.md
// in the backend). Cypress uses its own TypeScript project, so they stay
// independent of the application types.
const candidateId = "70000000-0000-4000-8000-000000000001";
const jobId = "71000000-0000-4000-8000-000000000001";

const incompleteProfile = {
  id: candidateId,
  full_name: "Maria Aparecida Souza",
  age: 58,
  email: "maria@example.invalid",
  phone: "51999990000",
  city: "Porto Alegre",
  state: "RS",
  summary: null as string | null,
  accepts_automatic_application: false,
  experiences: [],
  education: [],
  certifications: [],
  skills: [],
  missing_fields: ["summary", "experiences", "education", "skills"],
  completion_percentage: 33,
};

function application(index: number, status: string, jobTitle: string) {
  return {
    id: `72000000-0000-4000-8000-00000000000${index}`,
    job_id: `73000000-0000-4000-8000-00000000000${index}`,
    job_title: jobTitle,
    company_name: `Empresa ${index}`,
    submitted_at: `2026-10-0${index}T15:00:00Z`,
    days_in_process: index,
    status,
    reason: null,
    similar_jobs: [],
  };
}

const openJob = {
  id: jobId,
  title: "Supervisor de Logística",
  company_name: "Move Distribuição",
  location: "Porto Alegre, RS",
  work_mode: "hybrid",
  salary_max: "6500.00",
  published_at: "2026-10-01T12:00:00Z",
  days_since_published: 3,
  matched_skill_count: 1,
  required_skill_count: 2,
  missing_skills: [
    {
      id: "74000000-0000-4000-8000-000000000001",
      name: "Excel",
      type: "hard",
    },
  ],
};

const jobDetail = {
  id: jobId,
  title: openJob.title,
  description: "Coordenar a operação diária do armazém.",
  company_id: "75000000-0000-4000-8000-000000000001",
  company_name: openJob.company_name,
  skills: openJob.missing_skills,
  work_mode: openJob.work_mode,
  location: openJob.location,
  closing_date: "2026-12-31",
  status: "published",
  published_at: openJob.published_at,
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

describe("candidate home", () => {
  let profile: typeof incompleteProfile;
  let applications: ReturnType<typeof application>[];
  let jobs: (typeof openJob)[];
  let detail: typeof jobDetail;

  beforeEach(() => {
    profile = { ...incompleteProfile };
    applications = [
      application(4, "under_review", "Analista Administrativo"),
      application(3, "applied", "Assistente de Compras"),
      application(2, "not_selected", "Recepcionista"),
      application(1, "hired", "Auxiliar de Escritório"),
    ];
    jobs = [openJob];
    detail = { ...jobDetail };

    cy.intercept("GET", "**/auth/me", {
      body: { id: candidateId, user_type: "candidate", company_status: null },
    }).as("currentUser");
    cy.intercept("GET", "**/config/support", { statusCode: 404, body: {} });
    cy.intercept("GET", "**/professionals/me", (request) => {
      request.reply({ body: profile });
    }).as("profile");
    cy.intercept("GET", "**/applications/me*", (request) => {
      const limit = new URL(request.url).searchParams.get("limit");
      request.reply({
        body: limit ? applications.slice(0, Number(limit)) : applications,
      });
    }).as("applications");
    cy.intercept({ method: "GET", pathname: "/api/v1/jobs" }, (request) => {
      request.reply({ body: jobs });
    }).as("jobs");
    cy.intercept("GET", `**/jobs/${jobId}`, (request) => {
      request.reply({ body: detail });
    }).as("detail");
    cy.intercept("POST", "**/applications", (request) => {
      expect(request.body).to.deep.equal({ job_id: jobId });
      const created = {
        ...application(5, "under_review", openJob.title),
        job_id: jobId,
        company_name: openJob.company_name,
        submitted_at: "2026-10-05T15:00:00Z",
      };
      applications = [created, ...applications];
      detail = { ...detail, already_applied: true, is_applicable: false };
      request.reply({
        statusCode: 201,
        body: {
          id: created.id,
          job_id: jobId,
          status: created.status,
          submitted_at: created.submitted_at,
          matched_requirements: 1,
          total_requirements: 2,
        },
      });
    }).as("apply");
    cy.intercept("POST", "**/applications/*/withdraw", (request) => {
      const id = /applications\/([^/]+)\/withdraw/.exec(request.url)?.[1];
      applications = applications.map((item) =>
        item.id === id ? { ...item, status: "withdrawn" } : item,
      );
      request.reply({ body: applications.find((item) => item.id === id) });
    }).as("withdraw");
  });

  function visitHome(): void {
    cy.visit("/candidato", {
      onBeforeLoad(window) {
        window.sessionStorage.setItem(
          "seniors.access-token",
          "synthetic-access",
        );
      },
    });
    cy.wait("@currentUser");
  }

  function returnHome(): void {
    cy.get('aside a[href="/candidato"]').click();
    cy.location("pathname").should("eq", "/candidato");
    cy.contains("h1", "Olá, Maria!").should("be.visible");
  }

  function card(name: string) {
    return cy.get(`section[aria-labelledby]`).filter(`:contains("${name}")`);
  }

  it("shows the session's own summary from the three sources and passes axe", () => {
    visitHome();

    cy.contains("h1", "Olá, Maria!").should("be.visible");
    cy.wait("@applications").its("request.url").should("include", "limit=3");
    cy.wait("@jobs").its("request.query").should("deep.include", {
      limit: "3",
      offset: "0",
    });

    card("Seu perfil").within(() => {
      cy.contains("33% completo").should("be.visible");
      cy.contains("li", "Resumo profissional").should("be.visible");
      cy.contains("li", "Habilidades").should("be.visible");
    });
    card("Candidaturas recentes").within(() => {
      cy.get("li").should("have.length", 3);
      cy.get("li")
        .first()
        .should("contain.text", "Analista Administrativo")
        .and("contain.text", "Empresa 4 · Enviada em 4 de outubro")
        .and("contain.text", "Em análise");
      cy.contains("Auxiliar de Escritório").should("not.exist");
    });
    card("Vagas abertas").within(() => {
      cy.contains("h3", "Supervisor de Logística").should("be.visible");
      cy.contains("Porto Alegre, RS · Híbrido · até R$").should("be.visible");
      cy.contains("Você atende 1 dos 2 requisitos. Falta Excel.").should(
        "be.visible",
      );
    });

    // Header, navigation, notifications and support stay the shell's own.
    cy.get("header").should("have.length", 1);
    cy.get('a[href="/candidato/notificacoes"]').should("have.length", 1);
    cy.injectAxe();
    cy.checkA11y(undefined, wcag);
  });

  it("opens the source screen behind each shortcut", () => {
    visitHome();

    cy.contains("a", "Completar perfil").click();
    cy.location("pathname").should("eq", "/candidato/perfil");
    cy.contains("Maria Aparecida Souza").should("be.visible");

    returnHome();
    cy.get('a[aria-label="Ver todas as candidaturas"]').click();
    cy.location("pathname").should("eq", "/candidato/candidaturas");
    cy.contains("Auxiliar de Escritório").should("be.visible");

    returnHome();
    cy.contains("a", "Ver todas as vagas").click();
    cy.location("pathname").should("eq", "/candidato/vagas");
    cy.contains("h1", "Vagas").should("be.visible");

    returnHome();
    cy.get(`a[aria-label="Ver vaga ${openJob.title}"]`).click();
    cy.location("pathname").should("eq", `/candidato/vagas/${jobId}`);
    cy.wait("@detail");
    cy.contains(jobDetail.description).should("be.visible");
  });

  it("stays coherent with the source screens after changes elsewhere", () => {
    visitHome();
    card("Seu perfil").should("contain.text", "33% completo");

    // A profile edit saved on Meu perfil.
    cy.contains("a", "Completar perfil").click();
    // Routes load on demand: wait for the source screen itself, or the home
    // page never unmounts and the round trip proves nothing.
    cy.location("pathname").should("eq", "/candidato/perfil");
    cy.contains("Maria Aparecida Souza").should("be.visible");
    cy.then(() => {
      profile = {
        ...profile,
        summary: "Experiência em logística.",
        missing_fields: ["experiences", "education", "skills"],
        completion_percentage: 50,
      };
    });
    returnHome();
    card("Seu perfil").within(() => {
      cy.contains("50% completo").should("be.visible");
      cy.contains("li", "Resumo profissional").should("not.exist");
    });

    // A company moved an application forward while the candidate was away.
    cy.then(() => {
      applications = applications.map((item, index) =>
        index === 0 ? { ...item, status: "in_selection_process" } : item,
      );
    });
    cy.contains("a", "Ver todas as vagas").click();
    cy.contains("h1", "Vagas").should("be.visible");
    returnHome();
    card("Candidaturas recentes")
      .find("li")
      .first()
      .should("contain.text", "Em processo seletivo");

    // Applying from the job detail.
    cy.get(`a[aria-label="Ver vaga ${openJob.title}"]`).click();
    cy.wait("@detail");
    cy.contains("button", "Candidatar-se").click();
    cy.wait("@apply");
    cy.contains("button", "Já candidatado").should("be.disabled");
    returnHome();
    card("Candidaturas recentes").within(() => {
      cy.get("li").should("have.length", 3);
      cy.get("li")
        .first()
        .should("contain.text", openJob.title)
        .and("contain.text", "Em análise");
    });

    // Withdrawing from Candidaturas.
    cy.get('a[aria-label="Ver todas as candidaturas"]').click();
    cy.contains("button", "Sair do processo").click();
    cy.get('[role="alertdialog"]')
      .contains("button", "Sair do processo")
      .click();
    cy.wait("@withdraw");
    cy.get('[role="alertdialog"]').should("not.exist");
    returnHome();
    card("Candidaturas recentes")
      .find("li")
      .first()
      .should("contain.text", "Você saiu do processo seletivo");
  });

  it("presents a complete profile and empty sources with guidance", () => {
    profile = {
      ...profile,
      summary: "Experiência em logística.",
      missing_fields: [],
      completion_percentage: 100,
    };
    applications = [];
    jobs = [];
    visitHome();

    card("Seu perfil").within(() => {
      cy.contains("100% completo").should("be.visible");
      cy.contains("Perfil completo.").should("be.visible");
      cy.get("li").should("not.exist");
      cy.contains("a", "Ver meu perfil").should("be.visible");
    });
    card("Candidaturas recentes").within(() => {
      cy.contains("Você ainda não se candidatou").should("be.visible");
      cy.contains("a", "Buscar vagas").should(
        "have.attr",
        "href",
        "/candidato/vagas",
      );
    });
    card("Vagas abertas")
      .contains("Não há vagas abertas no momento")
      .should("be.visible");
    cy.injectAxe();
    cy.checkA11y(undefined, wcag);
  });

  it("keeps the loaded cards when one source fails and recovers it on retry", () => {
    let failJobs = true;
    cy.intercept({ method: "GET", pathname: "/api/v1/jobs" }, (request) => {
      if (failJobs) {
        request.reply({
          statusCode: 500,
          body: { title: "Error", status: 500, code: "internal_error" },
        });
        return;
      }
      request.reply({ body: jobs });
    }).as("jobs");
    visitHome();

    card("Vagas abertas")
      .find('[role="alert"]')
      .should("contain.text", "Não foi possível carregar as vagas abertas.");
    card("Seu perfil").should("contain.text", "33% completo");
    card("Candidaturas recentes").find("li").should("have.length", 3);

    cy.then(() => {
      failJobs = false;
    });
    card("Vagas abertas").contains("button", "Tentar novamente").click();
    card("Vagas abertas")
      .contains("h3", "Supervisor de Logística")
      .should("be.visible");
    card("Seu perfil").should("contain.text", "33% completo");
  });

  it("fits a phone screen without horizontal scrolling", () => {
    cy.viewport(375, 812);
    visitHome();

    card("Vagas abertas").contains("h3", openJob.title).should("be.visible");
    cy.document().then((document) => {
      expect(document.documentElement.scrollWidth).to.be.at.most(375);
    });
    cy.injectAxe();
    cy.checkA11y(undefined, wcag);
  });
});
