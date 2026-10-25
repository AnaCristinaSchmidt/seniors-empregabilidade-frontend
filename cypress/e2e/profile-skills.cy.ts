import type * as axe from "axe-core";

type Skill = { id: string; name: string; type: "hard" | "soft" };

const candidateId = "00000000-0000-4000-8000-000000000001";
const leadership: Skill = {
  id: "50000000-0000-4000-8000-000000000001",
  name: "Liderança",
  type: "soft",
};
const negotiation: Skill = {
  id: "50000000-0000-4000-8000-000000000002",
  name: "Negociação",
  type: "soft",
};
const excel: Skill = {
  id: "50000000-0000-4000-8000-000000000003",
  name: "Excel",
  type: "hard",
};
const catalog = [excel, leadership, negotiation];
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

function comparable(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

describe("résumé skill selection", () => {
  beforeEach(() => {
    let skills = [leadership];
    const profile = () => ({
      id: candidateId,
      full_name: "Pessoa Sintética",
      age: 58,
      email: "candidate@example.invalid",
      phone: "11999990000",
      city: "Porto Alegre",
      state: "RS",
      summary: null,
      experiences: [],
      education: [],
      skills,
    });

    cy.intercept("POST", "**/auth/login", {
      body: {
        access_token: "synthetic-access",
        id_token: "synthetic-id",
        refresh_token: null,
        expires_in: 900,
        token_type: "Bearer",
        user_id: candidateId,
        user_type: "candidate",
      },
    });
    cy.intercept("GET", "**/auth/me", {
      body: { id: candidateId, user_type: "candidate", company_status: null },
    });
    cy.intercept("GET", "**/professionals/me", (req) => {
      req.reply(profile());
    }).as("profile");
    cy.intercept({ method: "GET", pathname: "**/skills" }, (req) => {
      const search = comparable(String(req.query.search ?? ""));
      req.reply(
        catalog.filter((skill) => comparable(skill.name).includes(search)),
      );
    }).as("catalog");
    cy.intercept("PUT", "**/professionals/me/skills", (req) => {
      const { skill_ids } = req.body as { skill_ids: string[] };
      skills = catalog.filter((skill) => skill_ids.includes(skill.id));
      req.reply(skills);
    }).as("replace");
    cy.intercept("PATCH", "**/professionals/me", (req) => {
      req.reply({ ...profile(), ...(req.body as object) });
    }).as("save");

    cy.visit("/login");
    cy.get("#email").type("candidate@example.invalid");
    cy.get("#password").type("SyntheticTest123!");
    cy.contains("button", "Entrar").click();
    cy.contains("a", "Meu perfil").click();
    cy.wait("@profile");
    cy.contains("button", "Editar perfil").click();
    cy.wait("@catalog");
  });

  it("picks several catalog skills and saves them with the résumé", () => {
    cy.get('[role="dialog"]').should("have.css", "opacity", "1");
    cy.injectAxe();
    cy.checkA11y('[role="dialog"]', wcag, reportViolations);

    cy.get('[aria-label="Catálogo de habilidades"]').within(() => {
      cy.contains("button", "Liderança").should(
        "have.attr",
        "aria-pressed",
        "true",
      );
      cy.contains("button", "Negociação").click();
      cy.contains("button", "Negociação").should(
        "have.attr",
        "aria-pressed",
        "true",
      );
    });
    cy.get('[role="dialog"]').contains("label", "Buscar no catálogo").click();
    cy.focused().type("excel");
    cy.contains('[role="status"]', "1 habilidade encontrada.");
    cy.get('[aria-label="Catálogo de habilidades"]')
      .contains("button", "Excel")
      .click();
    cy.get('[aria-label="Remover habilidade Liderança"]').click();
    cy.contains("Selecionadas (2)").should("be.visible");
    cy.checkA11y('[role="dialog"]', wcag, reportViolations);
    cy.get("@replace.all").should("have.length", 0);

    cy.contains("button", "Salvar alterações").click();

    cy.wait("@replace")
      .its("request.body.skill_ids")
      .should("have.members", [negotiation.id, excel.id]);
    cy.wait("@save");
    cy.get('[role="dialog"]').should("not.exist");
    cy.contains("h3", "Habilidades")
      .parent()
      .within(() => {
        cy.contains("Negociação").should("be.visible");
        cy.contains("Excel").should("be.visible");
        cy.contains("Liderança").should("not.exist");
      });
  });

  it("confirms before discarding a selection and keeps it when editing continues", () => {
    cy.get('[aria-label="Catálogo de habilidades"]')
      .contains("button", "Excel")
      .click();
    cy.contains("button", "Cancelar").click();

    cy.get('[role="alertdialog"]').should("be.visible");
    cy.contains("button", "Continuar editando").should("have.focus").click();
    cy.get('[aria-label="Remover habilidade Excel"]').should("be.visible");
    cy.contains("button", "Cancelar").click();
    cy.injectAxe();
    cy.checkA11y('[role="alertdialog"]', wcag, reportViolations);
    cy.contains("button", "Descartar alterações").click();

    cy.get('[role="dialog"]').should("not.exist");
    cy.contains("button", "Editar perfil").should("have.focus");
    cy.get("@replace.all").should("have.length", 0);
    cy.contains("h3", "Habilidades")
      .parent()
      .within(() => {
        cy.contains("Liderança").should("be.visible");
        cy.contains("Excel").should("not.exist");
      });
  });

  it("clears the search with Escape and confirms a second Escape", () => {
    cy.get('[aria-label="Catálogo de habilidades"]')
      .contains("button", "Excel")
      .click();
    cy.contains("label", "Buscar no catálogo").click();
    cy.focused().type("exc{esc}").should("have.value", "");
    cy.get('[role="alertdialog"]').should("not.exist");
    cy.focused().type("{esc}");
    cy.get('[role="alertdialog"]').should("be.visible");
    cy.focused().should("have.text", "Continuar editando");
    cy.realPress("Escape");
    cy.get('[role="alertdialog"]').should("not.exist");
    cy.contains("label", "Buscar no catálogo")
      .invoke("attr", "for")
      .then((id) => {
        cy.get(`[id="${String(id)}"]`).should("have.focus");
      });
  });

  it("focuses a visible save error on mobile and preserves the draft", () => {
    cy.viewport(390, 844);
    cy.intercept("PUT", "**/professionals/me/skills", {
      statusCode: 404,
      body: { code: "skill_not_found", title: "Not Found", status: 404 },
      delay: 300,
    }).as("failedSkills");
    cy.get('[aria-label="Catálogo de habilidades"]')
      .contains("button", "Excel")
      .click();
    cy.contains("button", "Salvar alterações").click();
    cy.contains("button", "Salvando...").should("be.disabled");
    cy.wait("@failedSkills");
    cy.get('[role="alert"]')
      .should("be.visible")
      .and("have.focus")
      .and("contain.text", "Revise a seleção");
    cy.get('[aria-label="Remover habilidade Excel"]').should("exist");
    cy.get('[role="dialog"]').then(($dialog) => {
      expect($dialog[0]!.scrollWidth).to.be.at.most(
        $dialog[0]!.clientWidth + 1,
      );
    });
    // Audit settled colors after the save button leaves its disabled state.
    cy.get('button[type="submit"]').should(($button) => {
      expect($button[0]!.getAnimations()).to.have.length(0);
    });
    cy.injectAxe();
    cy.checkA11y('[role="dialog"]', wcag, reportViolations);
  });

  it("explains partial success and reloads persisted skills after closing", () => {
    cy.intercept("PATCH", "**/professionals/me", {
      statusCode: 503,
      body: { code: "unavailable", title: "Unavailable", status: 503 },
    }).as("failedProfile");
    cy.get('[aria-label="Catálogo de habilidades"]')
      .contains("button", "Excel")
      .click();
    cy.contains("button", "Salvar alterações").click();
    cy.wait("@replace");
    cy.wait("@failedProfile");
    cy.get('[role="alert"]')
      .should("be.visible")
      .and("have.focus")
      .and("contain.text", "As habilidades foram salvas.");
    cy.contains("button", "Cancelar").click();
    cy.get('[role="dialog"]').should("not.exist");
    cy.wait("@profile");
    cy.contains("h3", "Habilidades").parent().should("contain.text", "Excel");
  });
});
