import { afterEach, describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api-error";

import { stubApiRoutes, type ApiStub } from "../../../tests/api-stub";

import {
  catalogSkillsErrorMessage,
  changeCatalogSkillStatus,
  createCatalogSkill,
  defaultSkillFilters,
  fetchCatalogSkills,
  skillSaveErrorMessage,
  skillsSearchParams,
  skillStatusErrorMessage,
  skillValuesSchema,
  updateCatalogSkill,
} from "./skill-catalog-api";

const skill = {
  id: "64000000-0000-4000-8000-000000000001",
  name: "Gestão de equipes",
  type: "soft",
  status: "active",
};

let stub: ApiStub | undefined;

afterEach(() => {
  stub?.restore();
  stub = undefined;
});

function apiError(status: number, code: string) {
  return new ApiError({ message: "no", status, code });
}

describe("skill filters", () => {
  it("sends only the filters in use", () => {
    expect(skillsSearchParams(defaultSkillFilters)).toBe("limit=20&offset=0");
    expect(
      skillsSearchParams({
        search: "  gestão ",
        type: "soft",
        status: "inactive",
        offset: 40,
      }),
    ).toBe("search=gest%C3%A3o&type=soft&status=inactive&limit=20&offset=40");
  });

  it("requires a name of at most 100 characters and a type", () => {
    expect(
      skillValuesSchema.safeParse({ name: "  ", type: "hard" }).success,
    ).toBe(false);
    expect(
      skillValuesSchema.safeParse({ name: "x".repeat(101), type: "hard" })
        .success,
    ).toBe(false);
    expect(skillValuesSchema.safeParse({ name: "Excel" }).success).toBe(false);
    expect(
      skillValuesSchema.safeParse({ name: "  Excel  ", type: "hard" }).data,
    ).toEqual({ name: "Excel", type: "hard" });
  });
});

describe("skill catalog requests", () => {
  it("reads one page of the catalog", async () => {
    stub = stubApiRoutes({
      "GET /admin/skills?limit=20&offset=0": {
        status: 200,
        data: { items: [skill], total: 1 },
      },
    });

    await expect(fetchCatalogSkills(defaultSkillFilters)).resolves.toEqual({
      items: [skill],
      total: 1,
    });
  });

  it("rejects an unexpected list", async () => {
    stub = stubApiRoutes({
      "GET /admin/skills?limit=20&offset=0": {
        status: 200,
        data: [{ ...skill, status: undefined }],
      },
    });

    await expect(fetchCatalogSkills(defaultSkillFilters)).rejects.toMatchObject(
      { code: "invalid_catalog_skill_list_response" },
    );
  });

  it("creates, renames and changes the status of a skill", async () => {
    stub = stubApiRoutes({
      "POST /admin/skills": { status: 201, data: skill },
      [`PATCH /admin/skills/${skill.id}`]: (request) => ({
        status: 200,
        data: { ...skill, ...(request.body as object) },
      }),
    });

    await expect(
      createCatalogSkill({ name: "Gestão de equipes", type: "soft" }),
    ).resolves.toEqual(skill);
    await expect(
      updateCatalogSkill(skill.id, { name: "Liderança", type: "soft" }),
    ).resolves.toMatchObject({ name: "Liderança" });
    await expect(
      changeCatalogSkillStatus(skill.id, "inactive"),
    ).resolves.toMatchObject({ status: "inactive" });

    expect(stub.requests.map((request) => request.body)).toEqual([
      { name: "Gestão de equipes", type: "soft" },
      { name: "Liderança", type: "soft" },
      { status: "inactive" },
    ]);
  });

  it("rejects an unexpected saved skill", async () => {
    stub = stubApiRoutes({
      "POST /admin/skills": { status: 201, data: { id: skill.id } },
    });

    await expect(
      createCatalogSkill({ name: "Excel", type: "hard" }),
    ).rejects.toMatchObject({ code: "invalid_catalog_skill_response" });
  });
});

describe("skill catalog error messages", () => {
  it("explains who can open the catalog", () => {
    expect(
      catalogSkillsErrorMessage(apiError(403, "administrator_required")),
    ).toBe(
      "Apenas administradores podem consultar o catálogo de competências.",
    );
    expect(catalogSkillsErrorMessage(new Error("offline"))).toBe(
      "Não foi possível carregar as competências. Tente novamente.",
    );
  });

  it("explains a refused save", () => {
    expect(skillSaveErrorMessage(apiError(409, "skill_name_conflict"))).toBe(
      "Já existe uma competência com esse nome no catálogo. Se ela estiver inativa, reative-a na lista.",
    );
    expect(skillSaveErrorMessage(apiError(404, "skill_not_found"))).toBe(
      "Esta competência não está mais disponível. Atualize a lista.",
    );
    expect(skillSaveErrorMessage(apiError(403, "administrator_required"))).toBe(
      "Apenas administradores podem alterar o catálogo de competências.",
    );
    expect(skillSaveErrorMessage(apiError(422, "validation_error"))).toBe(
      "Revise o nome: use de 1 a 100 caracteres visíveis.",
    );
    expect(skillSaveErrorMessage(new Error("offline"))).toBe(
      "Não foi possível salvar a competência. Os dados foram mantidos; tente novamente.",
    );
  });

  it("explains a refused status change", () => {
    expect(
      skillStatusErrorMessage(apiError(404, "skill_not_found"), "inactive"),
    ).toBe("Esta competência não está mais disponível. Atualize a lista.");
    expect(
      skillStatusErrorMessage(
        apiError(403, "administrator_required"),
        "active",
      ),
    ).toBe("Apenas administradores podem alterar o catálogo de competências.");
    expect(skillStatusErrorMessage(new Error("offline"), "inactive")).toBe(
      "Não foi possível inativar a competência. Tente novamente.",
    );
    expect(skillStatusErrorMessage(new Error("offline"), "active")).toBe(
      "Não foi possível reativar a competência. Tente novamente.",
    );
  });
});
