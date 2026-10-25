import { afterEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "@/lib/api-client";
import { ApiError } from "@/lib/api-error";

import {
  addProfileSkill,
  certificateFileProblem,
  certificationValuesSchema,
  createCertification,
  deleteCertificationById,
  deleteCertificationDocument,
  fetchCertificationDocumentUrl,
  fetchProfessionalProfile,
  professionalProfileQueryKey,
  removeProfileSkill,
  saveSkillSelection,
  skillCatalogQueryOptions,
  searchSkillCatalog,
  updateCertificationById,
  uploadCertificationDocument,
} from "./professional-profile";

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

afterEach(() => vi.resetAllMocks());

const validProfile = {
  id: "00000000-0000-4000-8000-000000000001",
  full_name: "Marcos Silveira",
  age: 58,
  email: "marcos@example.com",
  phone: "11988887777",
  city: "São Paulo",
  state: "SP",
  photo_url: null,
  summary: "Profissional de operações e logística.",
  experiences: [],
  education: [],
  certifications: [],
  skills: [],
};

describe("fetchProfessionalProfile", () => {
  it("requests the profile endpoint and returns the parsed data", async () => {
    const get = vi
      .spyOn(apiClient, "get")
      .mockResolvedValueOnce({ data: validProfile });

    await expect(fetchProfessionalProfile()).resolves.toEqual(validProfile);
    expect(get).toHaveBeenCalledWith("/professionals/me", {});
  });

  it("treats a profile from a backend without certifications as having none", async () => {
    const withoutCertifications: Record<string, unknown> = { ...validProfile };
    delete withoutCertifications.certifications;
    vi.spyOn(apiClient, "get").mockResolvedValueOnce({
      data: withoutCertifications,
    });

    await expect(fetchProfessionalProfile()).resolves.toMatchObject({
      certifications: [],
    });
  });

  it("rejects when the response does not match the expected shape", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValueOnce({
      data: { full_name: "Faltam os outros campos obrigatórios" },
    });

    await expect(fetchProfessionalProfile()).rejects.toThrow();
  });
});

describe("professionalProfileQueryKey", () => {
  it("is a stable, domain-scoped key", () => {
    expect(professionalProfileQueryKey).toEqual([
      "candidates",
      "professional-profile",
    ]);
  });
});

describe("skill catalog and profile skills", () => {
  it("keeps catalog searches separate and retains their previous page", () => {
    const options = skillCatalogQueryOptions("excel");
    expect(options.queryKey).toEqual(["skills", "catalog", "excel"]);
    expect(options.placeholderData).toBeDefined();
  });
  it("searches the catalog with the typed text", async () => {
    const skills = [{ id: "s2", name: "Negociação", type: "soft" }];
    const get = vi.spyOn(apiClient, "get").mockResolvedValueOnce({
      data: skills,
    });

    await expect(searchSkillCatalog("neg")).resolves.toEqual(skills);
    expect(get).toHaveBeenCalledWith("/skills", {
      params: { search: "neg", limit: 20 },
    });
  });

  it("rejects a catalog response with an unexpected shape", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValueOnce({
      data: ["Negociação"],
    });

    await expect(searchSkillCatalog("neg")).rejects.toThrow();
  });

  it("links a catalog skill to the profile by its id", async () => {
    const skill = { id: "s2", name: "Negociação", type: "soft" };
    const post = vi
      .spyOn(apiClient, "post")
      .mockResolvedValueOnce({ data: skill });

    await expect(addProfileSkill("s2")).resolves.toEqual(skill);
    expect(post).toHaveBeenCalledWith("/professionals/me/skills", {
      skill_id: "s2",
    });
  });

  it("rejects a linked skill response with an unexpected shape", async () => {
    vi.spyOn(apiClient, "post").mockResolvedValueOnce({ data: {} });

    await expect(addProfileSkill("s2")).rejects.toThrow();
  });

  it("unlinks a skill from the profile", async () => {
    const remove = vi
      .spyOn(apiClient, "delete")
      .mockResolvedValueOnce({ data: undefined });

    await removeProfileSkill("s2");

    expect(remove).toHaveBeenCalledWith("/professionals/me/skills/s2");
  });
});

describe("bulk skill selection", () => {
  const skill = { id: "s1", name: "Liderança", type: "soft" as const };

  it("replaces the entire selection with one request", async () => {
    const post = vi.spyOn(apiClient, "post");
    const remove = vi.spyOn(apiClient, "delete");
    const put = vi
      .spyOn(apiClient, "put")
      .mockResolvedValueOnce({ data: [skill] });
    await expect(saveSkillSelection([skill])).resolves.toEqual([skill]);
    expect(put).toHaveBeenCalledExactlyOnceWith("/professionals/me/skills", {
      skill_ids: ["s1"],
    });
    expect(post).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it("can clear all selected skills", async () => {
    const put = vi.spyOn(apiClient, "put").mockResolvedValueOnce({ data: [] });
    await expect(saveSkillSelection([])).resolves.toEqual([]);
    expect(put).toHaveBeenCalledWith("/professionals/me/skills", {
      skill_ids: [],
    });
  });

  it("rejects an invalid saved selection response", async () => {
    vi.spyOn(apiClient, "put").mockResolvedValueOnce({ data: ["Liderança"] });
    await expect(saveSkillSelection([skill])).rejects.toMatchObject({
      code: "invalid_skill_response",
    });
  });

  it("preserves the backend failure for the editor to handle", async () => {
    const failure = new ApiError({
      message: "Not found",
      code: "skill_not_found",
      status: 404,
    });
    vi.spyOn(apiClient, "put").mockRejectedValueOnce(failure);
    await expect(saveSkillSelection([skill])).rejects.toBe(failure);
  });
});

const certification = {
  id: "c1",
  name: "NR-35",
  issuer: "SENAI",
  issued_date: "2020-03-01",
  expiration_date: null,
  document: {
    filename: "nr35.pdf",
    content_type: "application/pdf",
    size_bytes: 2048,
    uploaded_at: "2026-10-13T12:00:00Z",
  },
};
const certificationValues = {
  name: "NR-35",
  issuer: "SENAI",
  issued_date: "2020-03-01",
  expiration_date: null,
};

describe("certifications", () => {
  it("creates, updates and deletes through the certification endpoints", async () => {
    const post = vi
      .spyOn(apiClient, "post")
      .mockResolvedValueOnce({ data: certification });
    const patch = vi
      .spyOn(apiClient, "patch")
      .mockResolvedValueOnce({ data: certification });
    const remove = vi.spyOn(apiClient, "delete").mockResolvedValue({});

    await expect(createCertification(certificationValues)).resolves.toEqual(
      certification,
    );
    await expect(
      updateCertificationById("c1", certificationValues),
    ).resolves.toEqual(certification);
    await deleteCertificationById("c1");
    await deleteCertificationDocument("c1");

    expect(post).toHaveBeenCalledWith(
      "/professionals/me/certifications",
      certificationValues,
    );
    expect(patch).toHaveBeenCalledWith(
      "/professionals/me/certifications/c1",
      certificationValues,
    );
    expect(remove).toHaveBeenCalledWith("/professionals/me/certifications/c1");
    expect(remove).toHaveBeenCalledWith(
      "/professionals/me/certifications/c1/document",
    );
  });

  it("rejects a certification response with an unexpected shape", async () => {
    vi.spyOn(apiClient, "post").mockResolvedValueOnce({ data: { id: "c1" } });

    await expect(
      createCertification(certificationValues),
    ).rejects.toMatchObject({ code: "invalid_certification_response" });
  });

  it("uploads the document as the multipart file field and reports progress", async () => {
    const put = vi
      .spyOn(apiClient, "put")
      .mockImplementationOnce((_url, _body, config) => {
        config?.onUploadProgress?.({
          loaded: 50,
          total: 200,
          bytes: 50,
        } as never);
        config?.onUploadProgress?.({ loaded: 10, bytes: 10 } as never);
        return Promise.resolve({ data: certification });
      });
    const progress = vi.fn();
    const file = new File(["%PDF-"], "nr35.pdf", { type: "application/pdf" });

    await uploadCertificationDocument("c1", file, progress);

    const [url, body] = put.mock.calls[0]!;
    expect(url).toBe("/professionals/me/certifications/c1/document");
    expect((body as FormData).get("file")).toBe(file);
    expect(progress).toHaveBeenCalledExactlyOnceWith(25);
  });

  it("returns the download link of a document", async () => {
    const get = vi.spyOn(apiClient, "get").mockResolvedValueOnce({
      data: {
        url: "https://storage.example.invalid/c1?sig=1",
        expires_at: "2026-10-13T12:05:00Z",
      },
    });

    await expect(fetchCertificationDocumentUrl("c1")).resolves.toBe(
      "https://storage.example.invalid/c1?sig=1",
    );
    expect(get).toHaveBeenCalledWith(
      "/professionals/me/certifications/c1/document",
    );
  });

  it("rejects a download link response without a URL", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValueOnce({ data: { url: "" } });

    await expect(fetchCertificationDocumentUrl("c1")).rejects.toMatchObject({
      code: "invalid_document_link_response",
    });
  });

  it("requires a name and an expiration on or after the issue date", () => {
    expect(
      certificationValuesSchema.safeParse({ ...certificationValues, name: " " })
        .success,
    ).toBe(false);
    expect(
      certificationValuesSchema.safeParse({
        ...certificationValues,
        expiration_date: "2019-01-01",
      }).error?.issues[0]?.message,
    ).toBe("A validade não pode ser anterior à data de emissão.");
    expect(
      certificationValuesSchema.safeParse({
        ...certificationValues,
        expiration_date: "2020-03-01",
      }).success,
    ).toBe(true);
  });
});

describe("certificateFileProblem", () => {
  it("accepts PDF, PNG and JPG up to 5 MB", () => {
    expect(
      certificateFileProblem(
        new File(["x"], "a.pdf", { type: "application/pdf" }),
      ),
    ).toBeNull();
    expect(certificateFileProblem(new File(["x"], "foto.JPEG"))).toBeNull();
  });

  it("rejects other types and files over 5 MB", () => {
    expect(
      certificateFileProblem(
        new File(["x"], "a.docx", { type: "application/msword" }),
      ),
    ).toBe("Envie um arquivo PDF, PNG ou JPG.");
    const big = new File(["x"], "a.pdf", { type: "application/pdf" });
    Object.defineProperty(big, "size", { value: 5 * 1024 * 1024 + 1 });
    expect(certificateFileProblem(big)).toBe(
      "O arquivo pode ter no máximo 5 MB.",
    );
  });
});
