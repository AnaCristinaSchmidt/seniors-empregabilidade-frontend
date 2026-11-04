import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { CompanyBadge } from "@/components/ui/company-badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { applicationStatusLabel } from "@/lib/application-status";
import { missingFieldLabel } from "@/lib/resume-completeness";
import { cn } from "@/lib/utils";

import {
  fetchApplications,
  formatSubmittedDate,
  type Application,
} from "./applications-schema";
import { fetchJobs } from "./job-search";
import type { JobSearchResult } from "./job-search-schema";
import {
  formatMissingSkills,
  formatSalaryRange,
  formatWorkMode,
} from "./job-vacancy-format";
import { professionalProfileQueryOptions } from "./professional-profile";
import type { ProfessionalProfile } from "./professional-profile-schema";

// The home page shows a preview; the full lists live on their own screens.
const HOME_PREVIEW_SIZE = 3;

// Each card has its own query, so one failing source never hides the others.
// The keys share the prefix of the source screens, so the invalidations those
// screens already do (withdrawal, profile edits) reach these cards too.
const recentApplicationsQueryKey = ["applications", "home-preview"] as const;
const openJobsPreviewQueryKey = ["jobs", "home-preview"] as const;

export function CandidateHome() {
  const profile = useQuery(professionalProfileQueryOptions);
  const applications = useQuery({
    queryKey: recentApplicationsQueryKey,
    queryFn: ({ signal }) =>
      fetchApplications({ limit: HOME_PREVIEW_SIZE, signal }),
    retry: false,
  });
  const jobs = useQuery({
    queryKey: openJobsPreviewQueryKey,
    queryFn: ({ signal }) => fetchJobs("", signal, HOME_PREVIEW_SIZE),
    retry: false,
  });

  return (
    <div className="min-h-full bg-muted p-4 md:p-8">
      <h1 className="mb-2 text-3xl font-bold text-foreground">
        {profile.data
          ? `Olá, ${firstName(profile.data.full_name)}!`
          : "Área do candidato"}
      </h1>
      <p className="mb-6 text-lg text-foreground-2">
        Confira suas pendências e as próximas ações na plataforma.
      </p>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-col gap-6 lg:flex-1">
          <ProfileCard query={profile} onRetry={() => void profile.refetch()} />
          <RecentApplicationsCard
            query={applications}
            onRetry={() => void applications.refetch()}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-6 lg:flex-1">
          <OpenJobsCard query={jobs} onRetry={() => void jobs.refetch()} />
        </div>
      </div>
    </div>
  );
}

interface SectionQuery<T> {
  data: T | undefined;
  isPending: boolean;
  isError: boolean;
}

function HomeSection({
  id,
  title,
  action,
  children,
}: {
  id: string;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-4 rounded-lg border border-border bg-background p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Focusable from script only: a retry moves focus here, since its
            button disappears once the card loads. */}
        <h2 id={id} tabIndex={-1} className="text-xl font-bold text-foreground">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function SectionLoading({ label }: { label: string }) {
  return (
    <div role="status" className="flex flex-col gap-3">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-6 w-2/3 motion-reduce:animate-none" />
      <Skeleton className="h-6 w-full motion-reduce:animate-none" />
      <Skeleton className="h-6 w-1/2 motion-reduce:animate-none" />
    </div>
  );
}

function SectionError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3">
      <p className="text-lg text-foreground">{message}</p>
      <Button
        type="button"
        variant="outline"
        onClick={(event) => {
          event.currentTarget
            .closest("section")
            ?.querySelector<HTMLElement>("h2")
            ?.focus();
          onRetry();
        }}
      >
        Tentar novamente
      </Button>
    </div>
  );
}

function ProfileCard({
  query,
  onRetry,
}: {
  query: SectionQuery<ProfessionalProfile>;
  onRetry: () => void;
}) {
  return (
    <HomeSection id="home-profile" title="Seu perfil">
      {query.isPending ? (
        <SectionLoading label="Carregando seu perfil..." />
      ) : query.isError || !query.data ? (
        <SectionError
          message="Não foi possível carregar o resumo do seu perfil."
          onRetry={onRetry}
        />
      ) : (
        <ProfileSummary profile={query.data} />
      )}
    </HomeSection>
  );
}

function ProfileSummary({ profile }: { profile: ProfessionalProfile }) {
  const { missing_fields: missingFields, completion_percentage: percentage } =
    profile;
  const isComplete = missingFields?.length === 0;

  return (
    <>
      {percentage === undefined ? null : (
        <div className="flex flex-col gap-2">
          <p className="text-lg text-foreground">
            Seu perfil está <strong>{percentage}% completo</strong>.
          </p>
          <Progress value={percentage} aria-label="Completude do perfil" />
        </div>
      )}

      {isComplete ? (
        <p className="text-lg text-foreground">
          <strong className="text-success">Perfil completo.</strong> Todas as
          informações do seu currículo estão preenchidas.
        </p>
      ) : missingFields && missingFields.length > 0 ? (
        <div>
          <p className="mb-2 text-lg text-foreground">Ainda falta preencher:</p>
          <ul className="flex list-disc flex-col gap-1 pl-6 text-lg text-foreground">
            {missingFields.map((field) => (
              <li key={field}>{missingFieldLabel(field)}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <Link
        to="/candidato/perfil"
        className={cn(
          buttonVariants({ variant: isComplete ? "outline" : "default" }),
          "w-fit",
        )}
      >
        {isComplete ? "Ver meu perfil" : "Completar perfil"}
      </Link>
    </>
  );
}

function RecentApplicationsCard({
  query,
  onRetry,
}: {
  query: SectionQuery<Application[]>;
  onRetry: () => void;
}) {
  return (
    <HomeSection
      id="home-applications"
      title="Candidaturas recentes"
      action={
        <Link
          to="/candidato/candidaturas"
          aria-label="Ver todas as candidaturas"
          className={buttonVariants({ variant: "outline" })}
        >
          Ver todas
        </Link>
      }
    >
      {query.isPending ? (
        <SectionLoading label="Carregando suas candidaturas..." />
      ) : query.isError || !query.data ? (
        <SectionError
          message="Não foi possível carregar suas candidaturas."
          onRetry={onRetry}
        />
      ) : query.data.length === 0 ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-lg text-foreground">
            Você ainda não se candidatou a nenhuma vaga. Busque uma vaga e envie
            sua primeira candidatura.
          </p>
          <Link to="/candidato/vagas" className={buttonVariants()}>
            Buscar vagas
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {query.data.slice(0, HOME_PREVIEW_SIZE).map((application) => (
            <li key={application.id} className="py-3 first:pt-0 last:pb-0">
              <p className="text-lg font-semibold text-foreground">
                {application.job_title}
              </p>
              <p className="text-base text-foreground-2">
                {application.company_name} · Enviada em{" "}
                {formatSubmittedDate(application.submitted_at)}
              </p>
              <p className="text-base text-foreground">
                {applicationStatusLabel(application.status)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </HomeSection>
  );
}

function OpenJobsCard({
  query,
  onRetry,
}: {
  query: SectionQuery<JobSearchResult[]>;
  onRetry: () => void;
}) {
  return (
    <HomeSection
      id="home-jobs"
      title="Vagas abertas"
      action={
        <Link
          to="/candidato/vagas"
          className={buttonVariants({ variant: "outline" })}
        >
          Ver todas as vagas
        </Link>
      }
    >
      {query.isPending ? (
        <SectionLoading label="Carregando vagas abertas..." />
      ) : query.isError || !query.data ? (
        <SectionError
          message="Não foi possível carregar as vagas abertas."
          onRetry={onRetry}
        />
      ) : query.data.length === 0 ? (
        <p className="text-lg text-foreground">
          Não há vagas abertas no momento. Mantenha seu perfil atualizado e
          volte em breve para ver novas oportunidades.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {query.data.slice(0, HOME_PREVIEW_SIZE).map((job) => (
            <li key={job.id}>
              <JobPreview job={job} />
            </li>
          ))}
        </ul>
      )}
    </HomeSection>
  );
}

function JobPreview({ job }: { job: JobSearchResult }) {
  const titleId = `home-job-${job.id}`;

  return (
    <article
      aria-labelledby={titleId}
      className="flex flex-col gap-2 rounded-lg border border-border p-4"
    >
      <div className="flex items-start gap-3">
        <CompanyBadge companyName={job.company_name} />
        <div className="min-w-0">
          <h3 id={titleId} className="text-lg font-bold text-foreground">
            {job.title}
          </h3>
          <p className="text-base text-foreground-2">{job.company_name}</p>
        </div>
      </div>
      <p className="text-base text-muted-foreground">
        {[
          job.location,
          formatWorkMode(job.work_mode),
          formatSalaryRange(null, job.salary_max),
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <p className="text-base text-foreground">
        Você atende{" "}
        <strong>
          {job.matched_skill_count} dos {job.required_skill_count} requisitos
        </strong>
        . {formatMissingSkills(job.missing_skills.map((skill) => skill.name))}
      </p>
      <Link
        to="/candidato/vagas/$jobId"
        params={{ jobId: job.id }}
        aria-label={`Ver vaga ${job.title}`}
        className={cn(buttonVariants(), "w-fit")}
      >
        Ver vaga
      </Link>
    </article>
  );
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}
