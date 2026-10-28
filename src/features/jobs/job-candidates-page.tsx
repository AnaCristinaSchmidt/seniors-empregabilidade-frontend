import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toApiError } from "@/lib/api-error";

import { Button } from "@/components/ui/button";

import { isOpenToCandidates } from "./job-status";
import {
  changeApplicationStatus,
  fetchApplicantDetail,
  fetchJobApplicants,
  isApplication,
  type ApplicationStatus,
  type CompanyActionStatus,
  type JobApplicant,
  type JobApplicants,
} from "./job-candidates-api";
import { fetchMyJobs, type JobSummary } from "./jobs-api";

interface JobWithApplicants {
  job: JobSummary;
  candidates: Omit<JobApplicants, "applicants"> & {
    applicants: JobApplicant[];
  };
}

const candidatesQueryKey = ["jobs", "candidates"] as const;

async function fetchCandidateManagement(
  signal?: AbortSignal,
): Promise<JobWithApplicants[]> {
  const jobs = await fetchMyJobs(signal);
  return Promise.all(
    jobs.map(async (job) => {
      const candidates = await fetchJobApplicants(job.id, signal);
      return {
        job,
        candidates: {
          ...candidates,
          applicants: candidates.applicants.filter(isApplication),
        },
      };
    }),
  );
}

const statusLabels: Record<ApplicationStatus, string> = {
  applied: "Aguardando análise",
  under_review: "Em análise",
  in_selection_process: "Em seleção",
  hired: "Selecionado",
  not_selected: "Não selecionado",
  withdrawn: "Candidatura retirada",
  expired: "Expirada",
};

interface PendingAction {
  applicant: JobApplicant;
  status: CompanyActionStatus;
}

export function JobCandidatesPage({
  initialJobId,
}: {
  initialJobId?: string | undefined;
}) {
  const queryClient = useQueryClient();
  const [selectedJobId, setSelectedJobId] = useState<string | null>(
    initialJobId ?? null,
  );
  const [openProfile, setOpenProfile] = useState<JobApplicant | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null,
  );
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const jobs = useQuery({
    queryKey: candidatesQueryKey,
    queryFn: ({ signal }) => fetchCandidateManagement(signal),
    retry: false,
  });
  const profile = useQuery({
    queryKey: ["applications", "profile", openProfile?.application_id],
    queryFn: ({ signal }) =>
      fetchApplicantDetail(openProfile!.application_id, signal),
    enabled: openProfile !== null,
    retry: false,
  });
  const action = useMutation({
    mutationFn: changeApplicationStatus,
    onSuccess: (updated) => {
      queryClient.setQueryData<JobWithApplicants[]>(
        candidatesQueryKey,
        (current) =>
          current?.map((entry) => ({
            ...entry,
            candidates: {
              ...entry.candidates,
              applicants: entry.candidates.applicants.map((applicant) =>
                applicant.application_id === updated.application_id
                  ? { ...applicant, status: updated.status }
                  : applicant,
              ),
            },
          })),
      );
      setActionError("");
      setNotice(`Status atualizado para ${statusLabels[updated.status]}.`);
      setPendingAction(null);
      setReason("");
      void queryClient.invalidateQueries({ queryKey: ["applications"] });
      void queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
    onError: (error) => {
      const conflict = toApiError(error).status === 409;
      setActionError(
        conflict
          ? "A candidatura mudou. Confira o status atualizado antes de tentar novamente."
          : "Não foi possível atualizar a candidatura. Tente novamente.",
      );
      void queryClient.invalidateQueries({ queryKey: candidatesQueryKey });
    },
  });

  const selected = jobs.data?.find((entry) => entry.job.id === selectedJobId);
  const openJobs = jobs.data?.filter(({ job }) =>
    isOpenToCandidates(job),
  ).length;
  const received = jobs.data?.reduce(
    (count, { candidates }) => count + candidates.total_applicant_count,
    0,
  );
  const awaiting = jobs.data?.reduce(
    (count, { candidates }) =>
      count +
      candidates.applicants.filter(
        (item) => item.status === "applied" || item.status === "under_review",
      ).length,
    0,
  );

  function requestAction(applicant: JobApplicant, status: CompanyActionStatus) {
    setActionError("");
    setNotice("");
    if (status === "hired" || status === "not_selected") {
      setReason("");
      setPendingAction({ applicant, status });
      return;
    }
    action.mutate({ applicationId: applicant.application_id, status });
  }

  return (
    <div className="min-h-full bg-muted p-4 md:p-8">
      <h1 className="text-3xl font-bold text-foreground">
        Candidatos por vaga
      </h1>
      <p className="mt-2 text-lg text-muted-foreground">
        Acompanhe as candidaturas e avance profissionais no processo seletivo.
      </p>

      <div
        role="status"
        aria-live="polite"
        className="mt-4 text-lg text-success"
      >
        {notice}
      </div>
      {actionError && (
        <p role="alert" className="mt-4 text-lg text-destructive">
          {actionError}
        </p>
      )}

      {jobs.isPending ? (
        <p role="status" className="mt-8 text-lg">
          Carregando candidatos…
        </p>
      ) : jobs.isError ? (
        <div
          role="alert"
          className="mt-8 rounded-lg border border-destructive bg-background p-6"
        >
          <p className="text-lg">Não foi possível carregar os candidatos.</p>
          <Button
            type="button"
            variant="outline"
            className="mt-4"
            onClick={() => void jobs.refetch()}
          >
            Tentar novamente
          </Button>
        </div>
      ) : (
        <>
          <section
            aria-label="Resumo das candidaturas"
            className="mt-6 grid gap-4 sm:grid-cols-3"
          >
            <SummaryCard label="Vagas em aberto" value={openJobs ?? 0} />
            <SummaryCard label="Candidaturas recebidas" value={received ?? 0} />
            <SummaryCard label="Aguardando resposta" value={awaiting ?? 0} />
          </section>

          <section aria-labelledby="jobs-title" className="mt-8">
            <h2 id="jobs-title" className="text-2xl font-bold">
              Vagas
            </h2>
            {jobs.data.length === 0 ? (
              <p className="mt-4 rounded-lg border border-border bg-background p-6 text-lg">
                Você ainda não publicou vagas.
              </p>
            ) : (
              <ul className="mt-4 grid gap-4">
                {jobs.data.map(({ job, candidates }) => (
                  <li
                    key={job.id}
                    className="rounded-lg border border-border bg-background p-5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <h3 className="text-xl font-bold">{job.title}</h3>
                        <p className="mt-1 text-base text-muted-foreground">
                          {candidates.total_applicant_count} candidatos ·{" "}
                          {candidates.full_match_count} atendem a todos os
                          requisitos
                        </p>
                        {candidates.automatic_match_count > 0 && (
                          <p className="mt-1 text-base text-muted-foreground">
                            {candidates.automatic_match_count} perfis com match
                            automático, sem candidatura.
                          </p>
                        )}
                      </div>
                      <Button
                        type="button"
                        aria-label={`${selectedJobId === job.id ? "Ocultar" : "Ver"} candidatos de ${job.title}`}
                        variant={
                          selectedJobId === job.id ? "secondary" : "outline"
                        }
                        aria-expanded={selectedJobId === job.id}
                        aria-controls={
                          selectedJobId === job.id
                            ? "selected-job-candidates"
                            : undefined
                        }
                        onClick={() =>
                          setSelectedJobId((current) =>
                            current === job.id ? null : job.id,
                          )
                        }
                      >
                        {selectedJobId === job.id
                          ? "Ocultar candidatos"
                          : "Ver candidatos"}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {selected && (
            <section
              id="selected-job-candidates"
              aria-labelledby="candidates-title"
              className="mt-8"
            >
              <h2 id="candidates-title" className="text-2xl font-bold">
                Candidatos — {selected.job.title}
              </h2>
              {selected.candidates.applicants.length === 0 ? (
                <p className="mt-4 rounded-lg border border-border bg-background p-6 text-lg">
                  Nenhum candidato ainda para esta vaga.
                </p>
              ) : (
                <ul className="mt-4 grid gap-4">
                  {selected.candidates.applicants.map((applicant) => (
                    <li key={applicant.application_id}>
                      <ApplicantCard
                        applicant={applicant}
                        busy={action.isPending}
                        onProfile={() => setOpenProfile(applicant)}
                        onAction={(status) => requestAction(applicant, status)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}

      <AlertDialog
        open={openProfile !== null}
        onOpenChange={(open) => !open && setOpenProfile(null)}
      >
        <AlertDialogContent className="max-h-[85vh] overflow-y-auto data-[size=default]:max-w-[calc(100%-2rem)] data-[size=default]:sm:max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Perfil de {openProfile?.profile.full_name}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {openProfile?.profile.city && openProfile.profile.state
                ? `${openProfile.profile.city}, ${openProfile.profile.state}`
                : "Localização não informada"}
              . Compatibilidade: atende {openProfile?.matched_skill_count} de{" "}
              {openProfile?.required_skill_count} requisitos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {profile.isPending ? (
            <p role="status" className="text-lg">
              Carregando perfil…
            </p>
          ) : profile.isError ? (
            <div role="alert" className="text-lg">
              <p>Não foi possível carregar o perfil.</p>
              <Button
                type="button"
                variant="outline"
                className="mt-3"
                onClick={() => void profile.refetch()}
              >
                Tentar novamente
              </Button>
            </div>
          ) : (
            <div className="space-y-5 text-left text-lg">
              {profile.data.summary && (
                <section aria-label="Resumo profissional">
                  <h3 className="font-bold">Resumo profissional</h3>
                  <p className="mt-1 whitespace-pre-line">
                    {profile.data.summary}
                  </p>
                </section>
              )}
              <section aria-label="Habilidades">
                <h3 className="font-bold">Habilidades</h3>
                {profile.data.skills.length === 0 ? (
                  <p>Não informadas.</p>
                ) : (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {profile.data.skills.map((skill) => (
                      <li
                        key={skill.id}
                        className="rounded-full border border-border px-3 py-1"
                      >
                        {skill.name}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section aria-label="Experiências">
                <h3 className="font-bold">Experiências</h3>
                {profile.data.experiences.length === 0 ? (
                  <p>Não informadas.</p>
                ) : (
                  <ul className="mt-2 space-y-3">
                    {profile.data.experiences.map((item) => (
                      <li key={item.id}>
                        <p className="font-semibold">
                          {item.role} · {item.company_name}
                        </p>
                        <p className="text-base text-muted-foreground">
                          {formatDate(item.start_date)} –{" "}
                          {item.end_date ? formatDate(item.end_date) : "atual"}
                        </p>
                        {item.description && (
                          <p className="whitespace-pre-line">
                            {item.description}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section aria-label="Formação">
                <h3 className="font-bold">Formação</h3>
                {profile.data.education.length === 0 ? (
                  <p>Não informada.</p>
                ) : (
                  <ul className="mt-2 space-y-3">
                    {profile.data.education.map((item) => (
                      <li key={item.id}>
                        <p className="font-semibold">{item.institution}</p>
                        <p>
                          {[item.degree, item.field]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section aria-label="Certificações">
                <h3 className="font-bold">Certificações</h3>
                {profile.data.certifications.length === 0 ? (
                  <p>Não informadas.</p>
                ) : (
                  <ul className="mt-2 space-y-3">
                    {profile.data.certifications.map((item) => (
                      <li key={item.id}>
                        <p className="font-semibold">{item.name}</p>
                        {item.issuer && <p>{item.issuer}</p>}
                        {item.issued_date && (
                          <p className="text-base text-muted-foreground">
                            Emitido em {formatDate(item.issued_date)}
                          </p>
                        )}
                        {item.expiration_date && (
                          <p className="text-base text-muted-foreground">
                            Válido até {formatDate(item.expiration_date)}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Fechar</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingAction !== null}
        onOpenChange={(open) => {
          if (!open && !action.isPending) {
            setPendingAction(null);
            setReason("");
            setActionError("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingAction?.status === "hired"
                ? "Selecionar candidato?"
                : "Não selecionar candidato?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta decisão encerra a candidatura de{" "}
              {pendingAction?.applicant.profile.full_name}. O novo status será
              mostrado ao candidato.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pendingAction?.status === "not_selected" && (
            <label className="grid gap-2 text-base font-medium">
              Motivo para o candidato
              <textarea
                className="min-h-28 rounded-md border border-input bg-background p-3 text-lg"
                value={reason}
                disabled={action.isPending}
                maxLength={500}
                onChange={(event) => setReason(event.target.value)}
                required
              />
            </label>
          )}
          {actionError && (
            <p role="alert" className="text-base text-destructive">
              {actionError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={action.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              type="button"
              disabled={
                action.isPending ||
                (pendingAction?.status === "not_selected" && !reason.trim())
              }
              onClick={() => {
                if (pendingAction)
                  action.mutate({
                    applicationId: pendingAction.applicant.application_id,
                    status: pendingAction.status,
                    ...(pendingAction.status === "not_selected"
                      ? { reason: reason.trim() }
                      : {}),
                  });
              }}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function formatDate(date: string) {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-background p-5">
      <p className="text-base text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
    </div>
  );
}

function ApplicantCard({
  applicant,
  busy,
  onProfile,
  onAction,
}: {
  applicant: JobApplicant;
  busy: boolean;
  onProfile: () => void;
  onAction: (status: CompanyActionStatus) => void;
}) {
  const nextActions: Partial<Record<ApplicationStatus, CompanyActionStatus[]>> =
    {
      applied: ["under_review"],
      under_review: ["in_selection_process", "not_selected"],
      in_selection_process: ["hired", "not_selected"],
    };
  const labels: Record<CompanyActionStatus, string> = {
    under_review: "Iniciar análise",
    in_selection_process: "Avançar para seleção",
    hired: "Selecionar",
    not_selected: "Não selecionar",
  };
  return (
    <article className="rounded-lg border border-border bg-background p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold">{applicant.profile.full_name}</h3>
          <p className="mt-1 text-base text-muted-foreground">
            {statusLabels[applicant.status]}
          </p>
          <p className="mt-2 text-lg">
            Atende {applicant.matched_skill_count} de{" "}
            {applicant.required_skill_count} requisitos
          </p>
          {applicant.matched_skills.length > 0 && (
            <p className="mt-2 text-base">
              Atende:{" "}
              {applicant.matched_skills.map((skill) => skill.name).join(", ")}.
            </p>
          )}
          {applicant.missing_skills.length > 0 && (
            <p className="mt-2 text-base">
              Falta:{" "}
              {applicant.missing_skills.map((skill) => skill.name).join(", ")}.
            </p>
          )}
        </div>
        <Button type="button" variant="outline" onClick={onProfile}>
          Ver perfil
        </Button>
      </div>
      {(nextActions[applicant.status]?.length ?? 0) > 0 && (
        <div className="mt-5 flex flex-wrap gap-3">
          {nextActions[applicant.status]?.map((status) => (
            <Button
              key={status}
              type="button"
              variant={status === "not_selected" ? "outline" : "default"}
              disabled={busy}
              onClick={() => onAction(status)}
            >
              {labels[status]}
            </Button>
          ))}
        </div>
      )}
    </article>
  );
}
