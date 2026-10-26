import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";

import {
  HIGHLIGHT_THRESHOLD,
  jobApplicantsQueryOptions,
  sortByCompatibility,
  type JobApplicant,
} from "./professional-ranking";

interface ProfessionalRankingViewProps {
  jobId: string;
  /**
   * Ação do botão "Ver currículo". Sem ela o botão não aparece: ainda não há
   * endpoint que libere o currículo para a empresa.
   */
  onViewResume?: (applicant: JobApplicant) => void;
}

export function ProfessionalRankingView({
  jobId,
  onViewResume,
}: ProfessionalRankingViewProps) {
  const { data, isPending, isError, refetch } = useQuery(
    jobApplicantsQueryOptions(jobId),
  );

  return (
    <section className="p-6 md:p-8">
      <h1 className="text-3xl font-bold text-foreground">
        Profissionais da vaga
      </h1>
      <p className="mt-2 mb-6 max-w-3xl text-lg text-foreground-2">
        Ordenados do maior para o menor percentual de compatibilidade. Perfis a
        partir de {HIGHLIGHT_THRESHOLD}% aparecem em destaque; os demais
        continuam na lista.
      </p>

      {isPending ? (
        <RankingSkeleton />
      ) : isError ? (
        <RankingErrorState onRetry={() => void refetch()} />
      ) : (
        <RankingTable
          applicants={sortByCompatibility(data.applicants)}
          onViewResume={onViewResume}
        />
      )}
    </section>
  );
}

function RankingTable({
  applicants,
  onViewResume,
}: {
  applicants: JobApplicant[];
  onViewResume: ((applicant: JobApplicant) => void) | undefined;
}) {
  if (applicants.length === 0) {
    return (
      <p className="text-lg text-muted-foreground">
        Ainda não há profissionais compatíveis para esta vaga.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[680px] border-collapse text-left text-lg">
        <caption className="sr-only">
          Candidatos ordenados por compatibilidade, do maior para o menor
        </caption>
        <thead>
          <tr className="border-b-2 border-foreground text-base font-semibold text-foreground">
            <th scope="col" className="px-3 py-3">
              Candidato
            </th>
            <th scope="col" className="px-3 py-3">
              Compatibilidade
            </th>
            <th scope="col" className="px-3 py-3">
              Requisitos atendidos
            </th>
            {/* Sem ação de currículo ainda, a coluna some em vez de mostrar um
                botão que não faz nada. */}
            {onViewResume ? (
              <th scope="col" className="px-3 py-3">
                <span className="sr-only">Ações</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {applicants.map((applicant, index) => (
            <RankingRow
              key={applicant.profile.candidate_id}
              applicant={applicant}
              position={index + 1}
              onViewResume={onViewResume}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function skillNames(skills: JobApplicant["matched_skills"]): string {
  return skills.map((skill) => skill.name).join(", ");
}

function formatPercentage(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(2).replace(".", ",")}%`;
}

function RankingRow({
  applicant,
  position,
  onViewResume,
}: {
  applicant: JobApplicant;
  position: number;
  onViewResume: ((applicant: JobApplicant) => void) | undefined;
}) {
  const { profile, compatibility_percentage: percentage } = applicant;
  const highlighted = applicant.is_highlighted;
  const location = [profile.city, profile.state].filter(Boolean).join(", ");

  return (
    <tr
      data-highlighted={highlighted}
      className={
        highlighted
          ? "border-b border-l-4 border-rule border-l-success bg-success/5 align-top"
          : "border-b border-l-4 border-rule border-l-transparent align-top"
      }
    >
      <td className="px-3 py-4">
        <p className="text-base text-muted-foreground">{position}º</p>
        <p className="font-semibold text-foreground">{profile.full_name}</p>
        {location ? (
          <p className="text-base text-foreground-2">{location}</p>
        ) : null}
        <p className="text-base text-muted-foreground">
          {applicant.origin === "application"
            ? "Candidatou-se à vaga"
            : "Match automático"}
        </p>
      </td>
      <td className="px-3 py-4">
        {percentage === null ? (
          <p className="text-base text-muted-foreground">
            Sem cálculo: a vaga não tem requisitos
          </p>
        ) : (
          <>
            <p
              className={
                highlighted
                  ? "text-[26px] font-bold text-success"
                  : "text-[26px] font-bold text-foreground-2"
              }
            >
              {formatPercentage(percentage)}
              <span className="sr-only"> de compatibilidade</span>
            </p>
            {highlighted ? (
              <p className="text-base font-semibold text-success">
                Em destaque
              </p>
            ) : null}
          </>
        )}
      </td>
      <td className="px-3 py-4">
        <p className="text-base text-foreground">
          {applicant.matched_skill_count} de {applicant.required_skill_count}{" "}
          requisitos
        </p>
        {/* Os critérios que formam o percentual (US-19). */}
        {applicant.matched_skills.length > 0 ? (
          <p className="mt-1 text-base text-foreground">
            <span className="font-semibold">Atende:</span>{" "}
            {skillNames(applicant.matched_skills)}
          </p>
        ) : null}
        {applicant.missing_skills.length > 0 ? (
          <p className="mt-1 text-base text-foreground-2">
            <span className="font-semibold">Falta:</span>{" "}
            {skillNames(applicant.missing_skills)}
          </p>
        ) : null}
      </td>
      {onViewResume ? (
        <td className="px-3 py-4">
          {/* Disponível para todos, inclusive abaixo de 50%. */}
          <Button
            type="button"
            variant="outline"
            onClick={() => onViewResume(applicant)}
          >
            {/* Space outside the span, or the name reads "currículode". */}
            Ver currículo{" "}
            <span className="sr-only">de {profile.full_name}</span>
          </Button>
        </td>
      ) : null}
    </tr>
  );
}

function RankingSkeleton() {
  return (
    <div
      aria-hidden
      className="flex animate-pulse flex-col gap-3 motion-reduce:animate-none"
    >
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="h-20 rounded-lg bg-accent" />
      ))}
    </div>
  );
}

function RankingErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex max-w-md flex-col gap-4 rounded-lg border border-destructive bg-background p-6"
    >
      <span className="font-mono text-[13px] font-semibold tracking-wide text-destructive uppercase">
        Erro
      </span>
      <p className="text-lg text-foreground">
        Não foi possível carregar os profissionais. Tente novamente.
      </p>
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
