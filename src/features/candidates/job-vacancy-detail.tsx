import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { XIcon } from "lucide-react";
import { useId, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApiError } from "@/lib/api-error";

import { jobDetailQueryKey, jobDetailQueryOptions } from "./job-detail";
import type { JobDetail } from "./job-detail-schema";
import { applyToJobVacancy } from "./job-vacancies-api";
import { applyToJobVacancyErrorMessage } from "./job-vacancy-errors";
import { companyInitials, formatVacancyMeta } from "./job-vacancy-format";

export interface JobVacancyMatchSummary {
  matchedCount: number;
  requiredCount: number;
  missingNames: string[];
}

interface JobVacancyDetailProps {
  jobId: string;
  surface: "dialog" | "page";
  salaryMax?: number | null;
  matchSummary?: JobVacancyMatchSummary;
}

export function JobVacancyDetail({
  jobId,
  surface,
  salaryMax,
  matchSummary,
}: JobVacancyDetailProps) {
  const client = useQueryClient();
  // Job status and "already applied" come only from GET /jobs/{id}.
  const detail = useQuery(jobDetailQueryOptions(jobId));
  const errorId = useId();
  const mutation = useMutation({
    mutationFn: () => applyToJobVacancy(jobId),
    retry: false,
    gcTime: 0,
    onSuccess: async () => {
      await client.cancelQueries({ queryKey: jobDetailQueryKey(jobId) });
      client.setQueryData(jobDetailQueryKey(jobId), (previous) =>
        previous
          ? { ...previous, already_applied: true, is_applicable: false }
          : previous,
      );
      await Promise.all([
        client.invalidateQueries({ queryKey: ["applications"] }),
        client.invalidateQueries({ queryKey: ["jobs", "search"] }),
      ]);
    },
    onError: async (error) => {
      if (
        error instanceof ApiError &&
        (error.code === "already_applied" ||
          error.code === "job_closed" ||
          error.code === "job_not_found")
      ) {
        await client.invalidateQueries({ queryKey: jobDetailQueryKey(jobId) });
      }
    },
  });

  const vacancy = detail.data;
  const unavailable =
    detail.error instanceof ApiError && detail.error.status === 404;
  const meta =
    vacancy && !detail.isError
      ? formatVacancyMeta(vacancy, salaryMax)
      : "Consulte as informações e o prazo para candidatura.";
  const title = detail.isError || !vacancy ? "Detalhes da vaga" : vacancy.title;
  const showIdentity = Boolean(vacancy) && !detail.isError;

  const applyButton = (
    <Button
      type="button"
      className="rounded-full"
      disabled={
        !vacancy ||
        detail.isError ||
        detail.isFetching ||
        !vacancy.is_applicable ||
        mutation.isPending
      }
      aria-busy={mutation.isPending}
      aria-describedby={mutation.isError ? errorId : undefined}
      onClick={() => mutation.mutate()}
    >
      {mutation.isPending
        ? "Enviando candidatura…"
        : vacancy && !detail.isError
          ? applicationStateLabel(vacancy)
          : "Candidatar-se"}
    </Button>
  );

  return (
    <>
      {surface === "dialog" ? (
        <DialogHeader>
          <DetailHeading
            title={title}
            meta={meta}
            surface={surface}
            {...(showIdentity && vacancy?.company_name
              ? { companyName: vacancy.company_name }
              : {})}
            closeButton={
              <DialogClose
                render={
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="rounded-full"
                  >
                    <XIcon />
                    <span className="sr-only">Fechar</span>
                  </Button>
                }
              />
            }
          />
        </DialogHeader>
      ) : showIdentity && vacancy ? (
        <DetailHeading
          title={vacancy.title}
          meta={meta}
          surface={surface}
          companyName={vacancy.company_name}
        />
      ) : null}

      {detail.isPending ? (
        <p role="status" className="text-lg">
          Carregando detalhes da vaga…
        </p>
      ) : detail.isError ? (
        <div id={errorId} role="alert" className="flex flex-col gap-3 text-lg">
          <p>
            {unavailable
              ? "Esta vaga não está disponível."
              : "Não foi possível carregar os detalhes da vaga. Tente novamente."}
          </p>
          {!unavailable ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => void detail.refetch()}
            >
              Tentar novamente
            </Button>
          ) : null}
        </div>
      ) : vacancy ? (
        <>
          <section>
            <h3 className="mb-2 text-lg font-bold">Descrição da vaga</h3>
            <p className="text-lg leading-7 break-words whitespace-pre-line">
              {vacancy.description.trim() || "Descrição não informada."}
            </p>
          </section>
          <section>
            <h3 className="mb-2 text-lg font-bold">
              Requisitos e competências
            </h3>
            {vacancy.skills.length ? (
              <ul className="list-disc space-y-2 pl-6 text-lg">
                {vacancy.skills.map((skill) => (
                  <li key={skill.id}>{skill.name}</li>
                ))}
              </ul>
            ) : (
              <p className="text-lg">
                Esta vaga ainda não listou requisitos de habilidades.
              </p>
            )}
          </section>
          {matchSummary ? (
            <section>
              <h3 className="mb-2 text-lg font-bold">Como você se encaixa</h3>
              <p className="text-lg">
                Você atende {matchSummary.matchedCount} de{" "}
                {matchSummary.requiredCount} requisitos
              </p>
              {matchSummary.missingNames.length ? (
                <p className="mt-2 text-lg">
                  Habilidades em falta: {matchSummary.missingNames.join(", ")}.
                </p>
              ) : null}
            </section>
          ) : null}
          <p className="text-lg">
            Prazo para candidatura:{" "}
            <time dateTime={vacancy.closing_date}>
              {vacancy.closing_date.split("-").reverse().join("/")}
            </time>
          </p>
          {!vacancy.is_applicable ? (
            <p role="status" className="text-lg">
              {applicationStateLabel(vacancy)}
            </p>
          ) : null}
          {detail.isFetching ? (
            <p role="status" className="text-lg">
              Atualizando detalhes da vaga…
            </p>
          ) : null}
          {mutation.isSuccess ? (
            <p role="status" className="text-lg text-success">
              Candidatura enviada
            </p>
          ) : null}
          {mutation.isError ? (
            <p id={errorId} role="alert" className="text-lg text-destructive">
              {applyToJobVacancyErrorMessage(mutation.error)}
            </p>
          ) : null}
        </>
      ) : null}
      {surface === "dialog" ? (
        <DialogFooter>
          <DialogClose
            render={
              <Button type="button" variant="outline" className="rounded-full">
                Fechar
              </Button>
            }
          />
          {applyButton}
        </DialogFooter>
      ) : (
        <div>{applyButton}</div>
      )}
    </>
  );
}

function DetailHeading({
  title,
  meta,
  surface,
  companyName,
  closeButton,
}: {
  title: string;
  meta: string;
  surface: "dialog" | "page";
  companyName?: string;
  closeButton?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3">
        {companyName ? (
          <div
            aria-hidden="true"
            className="flex size-12 shrink-0 items-center justify-center rounded-md bg-accent text-base font-semibold text-foreground-2"
          >
            {companyInitials(companyName)}
          </div>
        ) : null}
        <div className="min-w-0">
          {surface === "dialog" ? (
            <DialogTitle className="text-xl font-bold">{title}</DialogTitle>
          ) : (
            <h2 className="text-xl font-bold text-foreground">{title}</h2>
          )}
          {companyName ? (
            <p className="mt-1 text-base text-muted-foreground">
              {companyName}
            </p>
          ) : null}
          {surface === "dialog" ? (
            <DialogDescription className="mt-1 text-base">
              {meta}
            </DialogDescription>
          ) : (
            <p className="mt-1 text-base text-muted-foreground">{meta}</p>
          )}
        </div>
      </div>
      {closeButton}
    </div>
  );
}

function applicationStateLabel(vacancy: JobDetail): string {
  if (vacancy.already_applied) return "Já candidatado";
  if (vacancy.is_expired) return "Vaga expirada";
  if (vacancy.status === "paused") return "Vaga pausada";
  if (!vacancy.is_open) return "Vaga encerrada";
  if (!vacancy.is_applicable) return "Candidatura indisponível";
  return "Candidatar-se";
}
