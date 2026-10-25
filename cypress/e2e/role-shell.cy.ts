const USER_ID = "11111111-1111-4111-8111-111111111111";
const WCAG = {
  runOnly: {
    type: "tag" as const,
    values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
  },
};

function stubSignIn(userType: string): void {
  cy.intercept("POST", "**/auth/login", {
    statusCode: 200,
    body: {
      access_token: "e2e-access-token",
      id_token: "e2e-id-token",
      refresh_token: null,
      expires_in: 900,
      token_type: "Bearer",
      user_id: USER_ID,
      user_type: userType,
    },
  }).as("login");

  cy.intercept("GET", "**/auth/me", {
    statusCode: 200,
    body: { id: USER_ID, user_type: userType, company_status: null },
  }).as("currentUser");

  // The header counter asks for the unread total; answer it so the shell
  // renders the same way on every run.
  cy.intercept("GET", /\/notifications\/me(\?|$)/, {
    statusCode: 200,
    body: { items: [], unread_count: 3, next_cursor: null },
  }).as("unreadCount");
}

function signIn(userType: string): void {
  stubSignIn(userType);
  cy.visit("/login");
  cy.get("#email").type("pessoa@exemplo.com");
  cy.get("#password").type("senha-sintetica");
  cy.contains("button", "Entrar").click();
  cy.wait("@login");
}

describe("role area shell", () => {
  it("shows the candidate sidebar and the greeting header", () => {
    signIn("candidate");

    cy.get("aside").within(() => {
      cy.contains("Seniors").should("be.visible");
      cy.contains("Área do candidato").should("be.visible");
      cy.contains("button", "Sair").should("be.visible");
    });
    cy.contains("Olá!").should("be.visible");
    cy.get('a[href="/candidato/notificacoes"]')
      .should("be.visible")
      .and("contain.text", "Notificações 3 não lidas");
    cy.contains("Suporte no WhatsApp").should("be.visible");
  });

  it("navigates from Relatórios to Meu perfil, staying inside the shell", () => {
    signIn("candidate");

    cy.contains("a", "Relatórios").should("have.attr", "aria-current", "page");
    cy.contains("a", "Página inicial").should("not.exist");
    cy.contains("a", "Entrar").should("not.exist");

    cy.contains("a", "Meu perfil").click();
    cy.location("pathname").should("eq", "/candidato/perfil");
    cy.contains("a", "Meu perfil").should("have.attr", "aria-current", "page");
    // A child route (not the role root itself) must still hide the public
    // SiteHeader — it renders per exact pathname, so a naive check would
    // miss this.
    cy.contains("a", "Página inicial").should("not.exist");
    cy.contains("a", "Entrar").should("not.exist");

    cy.contains("a", "Relatórios").click();
    cy.location("pathname").should("eq", "/candidato");
  });

  it("shows the company sidebar and a header with its notifications", () => {
    signIn("company");

    cy.get("aside").within(() => {
      cy.contains("Área da empresa").should("be.visible");
      cy.contains("button", "Sair").should("be.visible");
    });
    // Companies receive notifications (new applications), so their area now
    // has the header that holds the notifications link.
    cy.contains("Olá!").should("be.visible");
    cy.get('a[href="/empresa/notificacoes"]')
      .should("be.visible")
      .and("contain.text", "Notificações 3 não lidas");
  });

  it("shows the administrator sidebar without the greeting header", () => {
    signIn("administrator");

    cy.get("aside").within(() => {
      cy.contains("Administração").should("be.visible");
      cy.contains("button", "Sair").should("be.visible");
    });
    cy.contains("Olá!").should("not.exist");
    cy.contains("Notificações").should("not.exist");
  });

  it("signs out back to the login screen", () => {
    signIn("candidate");

    cy.contains("button", "Sair").click();

    cy.location("pathname").should("eq", "/login");
    cy.visit("/candidato");
    cy.location("pathname").should("eq", "/login");
  });

  it("reflows without horizontal scroll at 320px (WCAG 1.4.10)", () => {
    cy.viewport(320, 720);
    signIn("candidate");

    cy.document().then((doc) => {
      expect(doc.documentElement.scrollWidth).to.be.at.most(320);
    });

    // A real (non-forced) click fails if the floating support button visually
    // covers "Sair" — exactly the overlap this guards against.
    cy.contains("button", "Sair").click();
    cy.location("pathname").should("eq", "/login");
  });

  it("has no detectable WCAG 2.2 AA violations on the candidate shell", () => {
    signIn("candidate");
    cy.injectAxe();
    cy.checkA11y(undefined, WCAG);
  });

  it("has no detectable WCAG 2.2 AA violations on the company shell", () => {
    signIn("company");
    cy.injectAxe();
    cy.checkA11y(undefined, WCAG);
  });

  it("has no detectable WCAG 2.2 AA violations on the administrator shell", () => {
    signIn("administrator");
    cy.injectAxe();
    cy.checkA11y(undefined, WCAG);
  });
});
