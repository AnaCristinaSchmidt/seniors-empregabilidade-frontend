import type * as axe from "axe-core";
import type { ProfessionalProfile } from "../../src/features/candidates/professional-profile-schema";

const professionalId = "00000000-0000-4000-8000-000000000001";
const administratorId = "00000000-0000-4000-8000-000000000009";
// One rule in the backend feeds both views, so both read the same keys.
const missingFields = ["summary", "experiences"];
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

function visitAs(userId: string, userType: string, path: string): void {
  cy.intercept("GET", "**/auth/me", {
    body: { id: userId, user_type: userType, company_status: null },
  }).as("currentUser");
  cy.visit(path, {
    onBeforeLoad(window) {
      window.sessionStorage.setItem("seniors.access-token", "synthetic-access");
    },
  });
  cy.wait("@currentUser");
}

describe("résumé assistance end to end", () => {
  it("lists the incomplete résumé for the administrator and records guidance", () => {
    let lastGuidance: object | null = null;
    cy.intercept({ method: "GET", pathname: "**/professionals" }, (req) => {
      req.reply([
        {
          id: professionalId,
          full_name: "Pessoa Sintética",
          email: "candidate@example.invalid",
          phone: "11999990000",
          city: "Porto Alegre",
          state: "RS",
          missing_fields: missingFields,
          last_guidance: lastGuidance,
        },
      ]);
    }).as("resumes");
    cy.intercept(
      "POST",
      `**/professionals/${professionalId}/guidance`,
      (req) => {
        lastGuidance = {
          id: "70000000-0000-4000-8000-000000000001",
          note: (req.body as { note: string }).note,
          created_at: "2026-10-26T15:00:00Z",
          administrator_name: "Admin Sintético",
        };
        req.reply({ statusCode: 201, body: lastGuidance });
      },
    ).as("guidance");

    visitAs(administratorId, "administrator", "/administrador/candidatos");

    cy.wait("@resumes").its("request.query").should("include", {
      completeness: "incomplete",
      limit: "50",
      offset: "0",
    });
    cy.get('[aria-label="O que falta no currículo de Pessoa Sintética"]')
      .should("contain.text", "Resumo profissional")
      .and("contain.text", "Experiência profissional");

    cy.contains("button", "Registrar orientação").click();
    cy.get('[role="dialog"]').should("have.css", "opacity", "1");
    cy.injectAxe();
    cy.checkA11y('[role="dialog"]', wcag, reportViolations);
    cy.contains("label", "Orientação").click();
    cy.focused().type("Liguei e combinamos de completar o resumo.");
    cy.contains("button", "Salvar orientação").click();

    cy.wait("@guidance").its("request.body").should("deep.equal", {
      note: "Liguei e combinamos de completar o resumo.",
    });
    cy.contains(
      '[role="status"]',
      "Orientação registrada para Pessoa Sintética.",
    );
    cy.wait("@resumes");
    cy.contains("Última orientação em 26/10/2026, por Admin Sintético");

    cy.contains("label", "Contato").click();
    cy.focused().select("Com orientação registrada");
    cy.wait("@resumes")
      .its("request.query")
      .should("include", { contact_status: "contacted" });
  });

  it("shows the professional the same pending fields and a shortcut to each", () => {
    const profile: ProfessionalProfile = {
      id: professionalId,
      full_name: "Pessoa Sintética",
      age: 58,
      email: "candidate@example.invalid",
      phone: "11999990000",
      city: "Porto Alegre",
      state: "RS",
      summary: null,
      experiences: [],
      education: [],
      certifications: [],
      skills: [],
      missing_fields: missingFields,
    };
    cy.intercept("GET", "**/professionals/me", (request) => {
      request.reply({ body: profile });
    }).as("profile");
    cy.intercept("POST", "**/professionals/me/experiences", (request) => {
      const values = request.body as {
        role: string;
        company_name: string;
        start_date: string;
      };
      const experience = {
        id: "80000000-0000-4000-8000-000000000001",
        role: values.role,
        company_name: values.company_name,
        start_date: values.start_date,
        end_date: null,
        description: null,
      };
      profile.experiences = [experience];
      profile.missing_fields = ["summary"];
      request.reply({ statusCode: 201, body: experience });
    }).as("createExperience");
    cy.intercept({ method: "GET", pathname: "**/skills" }, []);

    visitAs(professionalId, "candidate", "/candidato");
    cy.contains("a", "Meu perfil").click();
    cy.wait("@profile");

    cy.contains("h2", "Complete seu currículo")
      .parent()
      .within(() => {
        cy.get("li").should("have.length", missingFields.length);
        cy.contains("li", "Resumo profissional");
        cy.contains("li", "Experiência profissional");
      });
    cy.injectAxe();
    cy.checkA11y("main", wcag, reportViolations);

    cy.get('[aria-label="Completar Experiência profissional"]').click();
    cy.focused().should("have.text", "Adicionar experiência");
    cy.focused().click();
    cy.get("#exp-role-new").type("Assistente de logística");
    cy.get("#exp-company-new").type("Empresa Sintética");
    cy.get("#exp-start-new").type("2024-01-01");
    cy.contains("button", "Concluir").click();
    cy.wait("@createExperience");
    cy.contains("button", "Cancelar").click();
    cy.wait("@profile");
    cy.get('[role="dialog"]').should("not.exist");
    cy.focused().should("have.text", "Editar perfil");
    cy.contains("li", "Experiência profissional").should("not.exist");

    cy.get('[aria-label="Completar Resumo profissional"]').click();
    cy.focused().should("have.attr", "id", "summary");
  });
});
