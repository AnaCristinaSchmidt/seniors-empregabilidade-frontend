const USER_ID = "11111111-1111-4111-8111-111111111111";

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
}

function signIn(userType: string): void {
  stubSignIn(userType);
  cy.visit("/login");
  cy.get("#email").type("pessoa@exemplo.com");
  cy.get("#password").type("senha-sintetica");
  cy.contains("button", "Entrar").click();
  cy.wait("@login");
}

describe("role based route protection", () => {
  it("sends each role to its own environment after signing in", () => {
    signIn("administrator");

    cy.location("pathname").should("eq", "/administrador");
    cy.contains("h1", "Relatórios da plataforma").should("be.visible");
  });

  it("refuses a typed URL when there is no session", () => {
    cy.visit("/empresa");

    cy.location("pathname").should("eq", "/login");
    cy.contains("h1", "Entrar").should("be.visible");
  });

  it("refuses a typed URL that belongs to another role", () => {
    signIn("candidate");
    cy.location("pathname").should("eq", "/candidato");

    cy.visit("/administrador");

    cy.location("pathname").should("eq", "/candidato");
    cy.contains("h1", "Área do candidato").should("be.visible");
  });

  it("sends an expired session back to the login screen", () => {
    signIn("candidate");
    cy.location("pathname").should("eq", "/candidato");

    cy.intercept("GET", "**/auth/me", {
      statusCode: 401,
      body: {
        type: "about:blank",
        title: "Unauthorized",
        status: 401,
        code: "invalid_access_token",
      },
    }).as("expired");

    cy.visit("/empresa");

    cy.location("pathname").should("eq", "/login");
  });
});
