import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { CompanyBadge } from "@/components/ui/company-badge";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import { jobSearchQueryOptions } from "./job-search";
import type { JobSearchResult, WorkMode } from "./job-search-schema";
import { JobVacancyDetailModal } from "./job-vacancy-detail-modal";

const WORK_MODE_LABELS: Record<WorkMode, string> = {
  onsite: "Presencial",
  hybrid: "Híbrido",
  remote: "Remoto",
};

// Espera a pessoa parar de digitar antes de disparar a busca de verdade,
// pra não mandar uma requisição a cada tecla.
const SEARCH_DEBOUNCE_MS = 400;

function useDebouncedValue(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [value, delayMs]);

  return debounced;
}

export function JobSearchView() {
  const [term, setTerm] = useState("");
  const [selectedJob, setSelectedJob] = useState<JobSearchResult | null>(null);
  const detailTriggerRef = useRef<HTMLButtonElement | null>(null);
  const debouncedTerm = useDebouncedValue(term, SEARCH_DEBOUNCE_MS);

  const {
    data: jobs,
    isPending,
    isError,
    refetch,
  } = useQuery(jobSearchQueryOptions(debouncedTerm));

  return (
    <main className="min-h-full bg-muted p-4 md:p-8">
      <h1 className="mb-6 text-3xl font-bold text-foreground">Vagas</h1>

      <Field className="mb-6 max-w-xl">
        <FieldLabel htmlFor="job-search">Buscar por vaga</FieldLabel>
        <Input
          id="job-search"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Cargo, empresa..."
        />
      </Field>

      {isPending ? (
        <JobSearchSkeleton />
      ) : isError ? (
        <JobSearchErrorState
          message="Não foi possível carregar as vagas. Tente novamente."
          onRetry={() => void refetch()}
        />
      ) : (
        <JobSearchResults
          jobs={jobs}
          term={debouncedTerm}
          onView={(job, trigger) => {
            detailTriggerRef.current = trigger;
            setSelectedJob(job);
          }}
        />
      )}

      <JobVacancyDetailModal
        jobId={selectedJob?.id ?? null}
        returnFocusRef={detailTriggerRef}
        {...(selectedJob
          ? {
              salaryMax: selectedJob.salary_max,
              matchSummary: {
                matchedCount: selectedJob.matched_skill_count,
                requiredCount: selectedJob.required_skill_count,
                missingNames: selectedJob.missing_skills.map(
                  (skill) => skill.name,
                ),
              },
            }
          : {})}
        open={selectedJob !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedJob(null);
        }}
      />
    </main>
  );
}

function JobSearchResults({
  jobs,
  term,
  onView,
}: {
  jobs: JobSearchResult[];
  term: string;
  onView: (job: JobSearchResult, trigger: HTMLButtonElement) => void;
}) {
  return (
    <div>
      <p className="mb-4 text-lg text-foreground">
        <strong>{jobs.length}</strong>{" "}
        {jobs.length === 1 ? "vaga encontrada" : "vagas encontradas"}
        {term ? <> para &quot;{term}&quot;</> : null}
      </p>

      {jobs.length === 0 ? (
        <p className="text-lg text-muted-foreground">
          Nenhuma vaga encontrada
          {term ? <> para &quot;{term}&quot;</> : null}.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} onView={onView} />
          ))}
        </div>
      )}
    </div>
  );
}

function JobCard({
  job,
  onView,
}: {
  job: JobSearchResult;
  onView: (job: JobSearchResult, trigger: HTMLButtonElement) => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-background p-6">
      <div className="flex items-start gap-3">
        <CompanyBadge companyName={job.company_name} />
        <div>
          <h2 className="text-xl font-bold text-foreground">{job.title}</h2>
          <p className="text-lg text-foreground-2">{job.company_name}</p>
        </div>
      </div>

      <p className="text-base text-muted-foreground">
        {[
          job.location,
          WORK_MODE_LABELS[job.work_mode],
          formatSalary(job.salary_max),
          formatPublishedAgo(job.days_since_published),
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>

      <p className="text-lg text-foreground">
        Você atende{" "}
        <strong>
          {job.matched_skill_count} dos {job.required_skill_count} requisitos
        </strong>
        . {formatMissingSkills(job.missing_skills)}
      </p>

      <Button
        type="button"
        className="w-fit"
        aria-label={`Ver vaga ${job.title}`}
        onClick={(event) => onView(job, event.currentTarget)}
      >
        Ver vaga
      </Button>
    </div>
  );
}

function formatSalary(salaryMax: number | null): string | null {
  if (salaryMax === null) {
    return null;
  }
  const formatted = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(salaryMax);
  return `Até ${formatted}`;
}

function formatPublishedAgo(days: number | null): string | null {
  if (days === null) {
    return null;
  }
  if (days === 0) {
    return "hoje";
  }
  if (days === 1) {
    return "há 1 dia";
  }
  return `há ${days} dias`;
}

function formatMissingSkills(
  missingSkills: JobSearchResult["missing_skills"],
): string {
  if (missingSkills.length === 0) {
    return "Você atende todos os requisitos.";
  }
  const names = missingSkills.map((skill) => skill.name);
  if (names.length === 1) {
    return `Falta ${names[0]}.`;
  }
  const last = names[names.length - 1];
  const rest = names.slice(0, -1);
  return `Faltam ${rest.join(", ")} e ${last}.`;
}

function JobSearchSkeleton() {
  return (
    <div
      className="grid animate-pulse grid-cols-1 gap-4 motion-reduce:animate-none lg:grid-cols-2"
      aria-hidden
    >
      {Array.from({ length: 4 }, (_, index) => (
        <div
          key={index}
          className="h-40 rounded-lg border border-border bg-accent"
        />
      ))}
    </div>
  );
}

function JobSearchErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex max-w-md flex-col gap-4 rounded-lg border border-destructive bg-background p-6"
    >
      <span className="font-mono text-[13px] font-semibold tracking-wide text-destructive uppercase">
        Erro
      </span>
      <p className="text-lg text-foreground">{message}</p>
      <Button
        type="button"
        variant="outline"
        onClick={onRetry}
        className="w-fit"
      >
        Tentar novamente
      </Button>
    </div>
  );
}
