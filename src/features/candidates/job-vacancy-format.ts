import type { JobDetail } from "./job-detail-schema";

const workModeLabels: Record<JobDetail["work_mode"], string> = {
  onsite: "Presencial",
  remote: "Remoto",
  hybrid: "Híbrido",
};

export function companyInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0]![0]!}${parts[1]![0]!}`.toUpperCase();
  }

  return name.slice(0, 2).toUpperCase();
}

export function formatWorkMode(workMode: JobDetail["work_mode"]): string {
  return workModeLabels[workMode];
}

export function formatSalaryRange(
  salaryMin: number | null,
  salaryMax: number | null,
): string | null {
  if (salaryMin === null && salaryMax === null) return null;

  const formatValue = (value: number) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      maximumFractionDigits: 0,
    }).format(value);

  if (salaryMin !== null && salaryMax !== null) {
    return `${formatValue(salaryMin)} a ${formatValue(salaryMax)}`;
  }

  if (salaryMin !== null) return `a partir de ${formatValue(salaryMin)}`;
  return `até ${formatValue(salaryMax!)}`;
}

function parseIsoDate(value: string): {
  year: number;
  month: number;
  day: number;
} | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;

  return {
    year: Number(match[1]),
    month: Number(match[2]) - 1,
    day: Number(match[3]),
  };
}

export function formatPublishedLabel(
  publishedAt: string,
  now: Date = new Date(),
): string | null {
  const published = parseIsoDate(publishedAt);
  if (!published) return null;

  const publishedUtc = Date.UTC(published.year, published.month, published.day);
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((todayUtc - publishedUtc) / 86_400_000);

  if (days <= 0) return "publicada hoje";
  if (days === 1) return "publicada há 1 dia";
  return `publicada há ${days} dias`;
}

/** "Tecnologia · Porto Alegre"; empty when the company has neither. */
export function formatCompanyContext(
  industry: string | null | undefined,
  city: string | null | undefined,
): string {
  return [industry, city].filter(Boolean).join(" · ");
}

export function formatVacancyMeta(
  vacancy: JobDetail,
  salaryMax?: number | null,
  now?: Date,
): string {
  return [
    vacancy.location,
    formatWorkMode(vacancy.work_mode),
    formatSalaryRange(null, salaryMax ?? null),
    vacancy.published_at
      ? formatPublishedLabel(vacancy.published_at, now)
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** "Falta X." / "Faltam X, Y e Z." for the job skills the résumé lacks. */
export function formatMissingSkills(names: readonly string[]): string {
  if (names.length === 0) {
    return "Você atende todos os requisitos.";
  }
  if (names.length === 1) {
    return `Falta ${names[0]}.`;
  }
  const last = names[names.length - 1];
  const rest = names.slice(0, -1);
  return `Faltam ${rest.join(", ")} e ${last}.`;
}
