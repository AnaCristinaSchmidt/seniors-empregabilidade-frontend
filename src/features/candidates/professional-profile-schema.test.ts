import { describe, expect, it } from "vitest";

import { professionalProfileSchema } from "./professional-profile-schema";

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
  experiences: [
    {
      id: "1",
      role: "Gerente de Operações",
      company_name: "Log Brasil",
      start_date: "2012-01-01",
      end_date: "2023-01-01",
      description: "Equipe de 40 pessoas em 3 centros de distribuição.",
    },
  ],
  education: [
    {
      id: "1",
      institution: "FGV",
      degree: "MBA",
      field: "Gestão Empresarial",
      start_date: "2010-01-01",
      end_date: "2011-12-01",
    },
  ],
  certifications: [],
  skills: [
    { id: "s1", name: "Liderança", type: "soft" },
    { id: "s2", name: "Logística", type: "hard" },
  ],
};

describe("professionalProfileSchema", () => {
  it("parses a complete valid profile", () => {
    expect(professionalProfileSchema.parse(validProfile)).toEqual(validProfile);
  });

  it("accepts photo_url entirely absent from the response (not just null)", () => {
    const withoutPhoto: Partial<typeof validProfile> = { ...validProfile };
    delete withoutPhoto.photo_url;

    expect(professionalProfileSchema.safeParse(withoutPhoto).success).toBe(
      true,
    );
  });

  it("accepts null for photo_url, summary, city and state", () => {
    const nullable = {
      ...validProfile,
      photo_url: null,
      summary: null,
      city: null,
      state: null,
    };
    expect(professionalProfileSchema.parse(nullable)).toEqual(nullable);
  });

  it("accepts null for an experience's description", () => {
    const nullDescription = {
      ...validProfile,
      experiences: [{ ...validProfile.experiences[0]!, description: null }],
    };
    expect(professionalProfileSchema.parse(nullDescription)).toEqual(
      nullDescription,
    );
  });

  it("accepts null for an education's degree and field", () => {
    const nullDegreeField = {
      ...validProfile,
      education: [{ ...validProfile.education[0]!, degree: null, field: null }],
    };
    expect(professionalProfileSchema.parse(nullDegreeField)).toEqual(
      nullDegreeField,
    );
  });

  it("accepts empty experiences, education and skills", () => {
    const empty = {
      ...validProfile,
      experiences: [],
      education: [],
      skills: [],
    };
    expect(professionalProfileSchema.parse(empty)).toEqual(empty);
  });

  it("accepts a null end_date for an ongoing experience", () => {
    const ongoing = {
      ...validProfile,
      experiences: [{ ...validProfile.experiences[0]!, end_date: null }],
    };
    expect(professionalProfileSchema.parse(ongoing)).toEqual(ongoing);
  });

  it("rejects a skill with a type outside hard/soft", () => {
    const invalidSkillType = {
      ...validProfile,
      skills: [{ id: "s1", name: "Liderança", type: "outra-coisa" }],
    };
    expect(professionalProfileSchema.safeParse(invalidSkillType).success).toBe(
      false,
    );
  });

  it.each([
    ["id", undefined],
    ["full_name", undefined],
    ["age", "58"],
    ["email", undefined],
    ["phone", undefined],
  ])("rejects a missing or invalid %s", (field, value) => {
    const invalid = { ...validProfile, [field]: value };
    expect(professionalProfileSchema.safeParse(invalid).success).toBe(false);
  });
});
