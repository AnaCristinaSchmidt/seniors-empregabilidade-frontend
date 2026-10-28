// The catalog classifies every skill as technical (hard) or behavioral (soft).
export const skillTypes = ["hard", "soft"] as const;

export type SkillType = (typeof skillTypes)[number];

export const skillTypeLabels: Record<SkillType, string> = {
  hard: "Técnica",
  soft: "Comportamental",
};
