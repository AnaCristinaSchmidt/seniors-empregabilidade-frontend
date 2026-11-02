const administratorId = "60000000-0000-4000-8000-000000000001";
const teamwork = {
  id: "64000000-0000-4000-8000-000000000001",
  name: "Trabalho em grupo",
  type: "soft",
  status: "active",
};
const forklift = {
  id: "64000000-0000-4000-8000-000000000002",
  name: "Operação de empilhadeira",
  type: "hard",
  status: "inactive",
};
const wcag = {
  runOnly: {
    type: "tag" as const,
    values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
  },
};

type Skill = typeof teamwork;

/** Serves the catalog from `catalog`, which the write intercepts update. */
function stubCatalog(catalog: Skill[]): void {
  cy.intercept("GET", "**/admin/skills?*", (request) => {
    const search = String(request.query.search ?? "").toLowerCase();
    const items = catalog.filter((skill) =>
      skill.name.toLowerCase().includes(search),
    );
    request.reply({ items, total: items.length });
  }).as("catalog");
}

function openCatalog(): void {
  cy.intercept("POST", "**/auth/login", {
    body: {
      access_token: "synthetic-admin",
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
  cy.get("#email").type("administrator@example.invalid");
  cy.get("#password").type("SyntheticTest123!");
  cy.contains("button", /^Entrar$/).click();
  cy.contains("a", "Competências").click();
  cy.contains("h1", "Competências").should("be.visible");
  cy.wait("@catalog");
}

describe("administrator skill catalog", () => {
  it("opens from the menu, reflows the page and searches by name", () => {
    stubCatalog([teamwork, forklift]);
    openCatalog();
    cy.contains("th", "Trabalho em grupo").should("exist");
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
    cy.get('input[type="search"]').type("empilhadeira");
    cy.wait("@catalog")
      .its("request.query")
      .should("include", { search: "empilhadeira", offset: "0" });
    cy.contains("th", "Operação de empilhadeira").should("exist");
    cy.contains("th", "Trabalho em grupo").should("not.exist");
  });

  it("adds, renames and inactivates skills from the keyboard", () => {
    const catalog: Skill[] = [teamwork, forklift];
    stubCatalog(catalog);
    let attempts = 0;
    cy.intercept("POST", "**/admin/skills", (request) => {
      attempts++;
      const body = request.body as { name: string; type: string };
      if (attempts === 1) {
        request.reply({
          statusCode: 409,
          body: {
            title: "Conflict",
            status: 409,
            code: "skill_name_conflict",
          },
        });
        return;
      }
      const created = {
        id: "64000000-0000-4000-8000-000000000003",
        status: "active",
        ...body,
      };
      catalog.push(created);
      request.reply({ statusCode: 201, body: created });
    }).as("create");
    cy.intercept("PATCH", "**/admin/skills/*", (request) => {
      const id = request.url.split("/").pop();
      const index = catalog.findIndex((skill) => skill.id === id);
      const updated = {
        ...catalog[index],
        ...(request.body as Partial<Skill>),
      } as Skill;
      catalog[index] = updated;
      request.reply(updated);
    }).as("update");
    openCatalog();

    cy.contains("button", /^Nova competência$/)
      .focus()
      .realPress("Enter");
    cy.get('[role="dialog"]')
      .should("be.visible")
      .and("have.css", "opacity", "1");
    cy.injectAxe();
    cy.checkA11y('[role="dialog"]', wcag);
    cy.get('[role="dialog"] input[name="name"]').type("Trabalho em grupo");
    cy.get('[role="dialog"] input[value="soft"]').check();
    cy.get('[role="dialog"]')
      .contains("button", /^Cadastrar competência$/)
      .click();
    cy.wait("@create");
    cy.focused()
      .should("have.attr", "name", "name")
      .and("have.attr", "aria-invalid", "true")
      .clear()
      .type("Comunicação com clientes{enter}");
    cy.wait("@create")
      .its("request.body")
      .should("deep.equal", { name: "Comunicação com clientes", type: "soft" });
    cy.get('[role="dialog"]').should("not.exist");
    cy.contains("Competência “Comunicação com clientes” cadastrada.").should(
      "be.visible",
    );
    cy.contains("th", "Comunicação com clientes").should("exist");

    cy.get('button[aria-label="Editar Trabalho em grupo"]').click();
    cy.get('[role="dialog"] input[name="name"]')
      .should("have.value", "Trabalho em grupo")
      .clear()
      .type("Trabalho em equipe{enter}");
    cy.wait("@update")
      .its("request.body")
      .should("deep.equal", { name: "Trabalho em equipe", type: "soft" });
    cy.contains("Competência “Trabalho em equipe” atualizada.").should(
      "be.visible",
    );

    cy.get('button[aria-label="Inativar Trabalho em equipe"]').click();
    cy.get('[role="alertdialog"]')
      .should("be.visible")
      .and("have.css", "opacity", "1");
    cy.injectAxe();
    cy.checkA11y('[role="alertdialog"]', wcag);
    cy.get('[role="alertdialog"]')
      .contains("button", /^Inativar competência$/)
      .click();
    cy.wait("@update")
      .its("request.body")
      .should("deep.equal", { status: "inactive" });
    cy.get('[role="alertdialog"]').should("not.exist");
    cy.get('button[aria-label="Reativar Trabalho em equipe"]').should("exist");
  });
});
