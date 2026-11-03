const missingFieldLabels: Record<string, string> = {
  city: "Cidade",
  state: "Estado",
  summary: "Resumo profissional",
  experiences: "Experiência profissional",
  education: "Formação",
  skills: "Habilidades",
};

export function missingFieldLabel(field: string): string {
  return missingFieldLabels[field] ?? field;
}
