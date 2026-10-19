import type * as axe from "axe-core";

const candidateId = "40000000-0000-4000-8000-000000000001";
const certificationId = "50000000-0000-4000-8000-000000000001";
const downloadPath = "/synthetic-storage/nr35.pdf";
const pdfBytes = "%PDF-1.7\n%synthetic\n";
const proof = {
  filename: "nr35.pdf",
  content_type: "application/pdf",
  size_bytes: pdfBytes.length,
  uploaded_at: "2026-10-13T12:00:00Z",
};
const savedCertification = {
  id: certificationId,
  name: "NR-35",
  issuer: "SENAI",
  issued_date: "2020-03-01",
  expiration_date: null,
  document: null as typeof proof | null,
};
const profile = {
  id: candidateId,
  full_name: "Pessoa Sintética",
  age: 61,
  email: "candidate@example.invalid",
  phone: "51999999999",
  city: "Porto Alegre",
  state: "RS",
  summary: null,
  photo_url: null,
  experiences: [],
  education: [],
  certifications: [] as (typeof savedCertification)[],
  skills: [],
};
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

function problem(status: number, code: string) {
  return {
    statusCode: status,
    headers: { "content-type": "application/problem+json" },
    body: { title: "Error", status, code },
  };
}

function openCertificationForm(): void {
  cy.contains("button", "Editar perfil").click();
  cy.get('[role="dialog"]').should("have.css", "opacity", "1");
  cy.contains("button", "Adicionar certificação").click();
  cy.get('[id^="cert-name-"]').type("NR-35");
  cy.get('[id^="cert-issuer-"]').type("SENAI");
  cy.get('[id^="cert-issued-"]').type("2020-03-01");
}

describe("candidate certifications", () => {
  let current: typeof profile;

  beforeEach(() => {
    current = { ...profile, certifications: [] };
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
    cy.intercept("GET", "**/professionals/me", (req) => req.reply(current)).as(
      "profile",
    );
    cy.intercept("GET", "**/skills*", []);
    cy.visit("/login");
    cy.get("#email").type("candidate@example.invalid");
    cy.get("#password").type("SyntheticTest123!");
    cy.contains("button", "Entrar").click();
    cy.contains("a", "Meu perfil").click();
    cy.wait("@profile");
  });

  it("adds a certification with its proof and downloads it as the owner", () => {
    cy.intercept("POST", "**/professionals/me/certifications", (req) => {
      current.certifications = [savedCertification];
      req.reply({ statusCode: 201, body: savedCertification });
    }).as("create");
    cy.intercept(
      "PUT",
      `**/professionals/me/certifications/${certificationId}/document`,
      (req) => {
        expect(req.headers["content-type"]).to.match(/^multipart\/form-data/);
        const uploaded = { ...savedCertification, document: proof };
        current.certifications = [uploaded];
        req.reply(uploaded);
      },
    ).as("upload");
    cy.intercept(
      "GET",
      `**/professionals/me/certifications/${certificationId}/document`,
      {
        body: {
          url: `${Cypress.config("baseUrl")}${downloadPath}`,
          expires_at: "2026-10-13T12:05:00Z",
        },
      },
    ).as("link");
    cy.intercept("GET", `**${downloadPath}`, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": 'attachment; filename="nr35.pdf"',
      },
      body: pdfBytes,
    }).as("file");

    cy.contains("Nenhuma certificação cadastrada ainda.").should("be.visible");
    openCertificationForm();
    cy.get('input[type="file"][id^="cert-file-"]').selectFile({
      contents: Cypress.Buffer.from(pdfBytes),
      fileName: "nr35.pdf",
      mimeType: "application/pdf",
    });
    cy.injectAxe();
    cy.checkA11y('[role="dialog"]', wcag, reportViolations);
    cy.get('[role="dialog"]').contains("button", "Concluir").click();
    cy.wait("@create").its("request.body").should("deep.equal", {
      name: "NR-35",
      issuer: "SENAI",
      issued_date: "2020-03-01",
      expiration_date: null,
    });
    cy.wait("@upload");
    cy.get('[role="dialog"]').should("contain.text", "Comprovante: nr35.pdf");
    cy.get("body").type("{esc}");
    cy.get('[role="dialog"]').should("not.exist");

    cy.contains("li", "NR-35").should("contain.text", "Emitida em 2020");
    cy.checkA11y("main", wcag, reportViolations);
    cy.contains("button", "Baixar comprovante").click();
    cy.wait("@link");
    cy.wait("@file");
    cy.readFile(`${Cypress.config("downloadsFolder")}/nr35.pdf`).should(
      "eq",
      pdfBytes,
    );
  });

  it("does not download a proof the API refuses to the current user", () => {
    current.certifications = [{ ...savedCertification, document: proof }];
    cy.intercept(
      "GET",
      `**/professionals/me/certifications/${certificationId}/document`,
      problem(404, "certification_not_found"),
    ).as("link");
    cy.intercept("GET", `**${downloadPath}`, cy.spy().as("file"));
    cy.reload();

    cy.contains("button", "Baixar comprovante").click();
    cy.wait("@link");
    cy.get("main [role='alert']").should(
      "contain.text",
      "Esta certificação não existe mais.",
    );
    cy.get("@file").should("not.have.been.called");
    cy.location("pathname").should("eq", "/candidato/perfil");
  });

  it("blocks an invalid file before sending it and explains a server refusal", () => {
    cy.intercept("POST", "**/professionals/me/certifications", (req) => {
      current.certifications = [savedCertification];
      req.reply({ statusCode: 201, body: savedCertification });
    }).as("create");
    cy.intercept(
      "PUT",
      `**/professionals/me/certifications/${certificationId}/document`,
      problem(422, "unsupported_document_type"),
    ).as("upload");

    openCertificationForm();
    cy.get('input[type="file"][id^="cert-file-"]').selectFile({
      contents: Cypress.Buffer.from("not a document"),
      fileName: "carta.docx",
      mimeType: "application/msword",
    });
    cy.get('[role="dialog"]').contains("button", "Concluir").click();
    cy.get('[role="dialog"] [role="alert"]').should(
      "contain.text",
      "Envie um arquivo PDF, PNG ou JPG.",
    );

    cy.get('input[type="file"][id^="cert-file-"]').selectFile({
      contents: Cypress.Buffer.alloc(5 * 1024 * 1024 + 1),
      fileName: "grande.pdf",
      mimeType: "application/pdf",
    });
    cy.get('[role="dialog"]').contains("button", "Concluir").click();
    cy.get('[role="dialog"] [role="alert"]').should(
      "contain.text",
      "O arquivo pode ter no máximo 5 MB.",
    );
    cy.get("@create.all").should("have.length", 0);

    // The API decides by the file's bytes, so a renamed file still fails there.
    cy.get('input[type="file"][id^="cert-file-"]').selectFile({
      contents: Cypress.Buffer.from("not really a pdf"),
      fileName: "disfarçado.pdf",
      mimeType: "application/pdf",
    });
    cy.get('[role="dialog"]').contains("button", "Concluir").click();
    cy.wait("@upload");
    cy.get('[role="dialog"] [role="alert"]').should(
      "contain.text",
      "Envie um arquivo PDF, PNG ou JPG.",
    );
  });
});
