import { useId, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  searchSchema,
  fetchApplications,
  withdrawApplication,
} from "./applications-schema";

import type {
  Application,
  ApplicationStatus,
  SearchForm,
} from "./applications-schema";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api-error";
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

export default function ApplicationsPage() {
  const queryClient = useQueryClient();
  const [appToQuit, setAppToQuit] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const dialogOpenerRef = useRef<HTMLElement | null>(null);
  const dialogAppIdRef = useRef<string | null>(null);
  const pageTitleRef = useRef<HTMLHeadingElement>(null);

  const {
    register,
    control,
    formState: { errors },
  } = useForm<SearchForm>({
    resolver: zodResolver(searchSchema),
    defaultValues: { search: "" },
    mode: "onChange",
  });

  const searchValue = useWatch({
    control,
    name: "search",
    defaultValue: "",
  });

  const searchTerm = searchValue?.trim() ?? "";
  const validSearch = searchSchema.safeParse({ search: searchValue }).success;

  const {
    data: applications,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["applications", searchTerm],
    enabled: validSearch,
    retry: false,
    queryFn: ({ signal }) =>
      fetchApplications({
        ...(searchTerm ? { companyName: searchTerm } : {}),
        signal,
      }),
  });

  const quitProcessMutation = useMutation({
    mutationFn: withdrawApplication,
    onSuccess: async (updated) => {
      await queryClient.cancelQueries({ queryKey: ["applications"] });
      queryClient.setQueriesData<Application[]>(
        { queryKey: ["applications"] },
        (current) =>
          current?.map((item) => (item.id === updated.id ? updated : item)),
      );
      setNotice("Você saiu do processo seletivo.");
      setAppToQuit(null);
      await queryClient.invalidateQueries({
        queryKey: ["applications"],
      });
    },
    onError: async () => {
      // A response can be lost after the server commits the withdrawal.
      await queryClient.invalidateQueries({ queryKey: ["applications"] });
    },
  });

  const selected = applications?.find((item) => item.id === appToQuit);
  const cannotRetry =
    quitProcessMutation.isError &&
    ((quitProcessMutation.error instanceof ApiError &&
      [404, 409].includes(quitProcessMutation.error.status ?? 0)) ||
      (!isError &&
        applications !== undefined &&
        (!selected ||
          !["applied", "under_review", "in_selection_process"].includes(
            selected.status,
          ))));

  return (
    <div className="space-y-8 bg-background p-4 md:p-8">
      <div>
        <h1
          ref={pageTitleRef}
          tabIndex={-1}
          className="mb-6 text-3xl font-bold text-foreground"
        >
          Candidaturas
        </h1>
        <div className="max-w-md space-y-1.5">
          <label htmlFor="search" className="text-base text-muted-foreground">
            Buscar por nome da empresa
          </label>
          <Input
            id="search"
            placeholder="Ex.: LogiBrás"
            {...register("search")}
            aria-invalid={!!errors.search}
            aria-describedby={errors.search ? "search-error" : undefined}
          />

          {errors.search?.message && (
            <p
              id="search-error"
              role="alert"
              className="pt-1 text-base text-destructive"
            >
              {errors.search.message}
            </p>
          )}
        </div>
      </div>

      <p role="status" className="text-base">
        {notice}
      </p>
      <div className="space-y-4">
        {isLoading && (
          <div role="status" aria-label="Carregando candidaturas">
            <Skeleton className="h-36 w-full rounded-lg" />
            <Skeleton className="mt-4 h-36 w-full rounded-lg" />
          </div>
        )}

        {isError && (
          <div
            role="alert"
            className="rounded-md border border-destructive bg-background p-4 text-base text-destructive"
          >
            Ocorreu um erro ao carregar suas candidaturas. Tente novamente mais
            tarde.
          </div>
        )}

        {!isLoading && !isError && applications?.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
            Nenhuma candidatura encontrada.
          </div>
        )}

        {validSearch &&
          applications?.map((application) => (
            <ApplicationCard
              key={application.id}
              application={application}
              onQuitProcess={(opener) => {
                quitProcessMutation.reset();
                dialogOpenerRef.current = opener;
                dialogAppIdRef.current = application.id;
                setNotice("");
                setAppToQuit(application.id);
              }}
              isQuitPending={quitProcessMutation.isPending}
            />
          ))}
      </div>
      <AlertDialog
        open={!!appToQuit}
        onOpenChange={(open) => {
          if (!open && !quitProcessMutation.isPending) {
            setAppToQuit(null);
          }
        }}
      >
        <AlertDialogContent
          className="rounded-xl border-border bg-background"
          finalFocus={() => {
            // A withdrawal or a refreshed list can remove the button that
            // opened the dialog; focus then falls back to the card, or to the
            // page title when the application is no longer listed.
            const opener = dialogOpenerRef.current;
            if (opener?.isConnected) return opener;
            const applicationId = dialogAppIdRef.current;
            const cardTitle = applicationId
              ? document.getElementById(applicationTitleId(applicationId))
              : null;
            return cardTitle ?? pageTitleRef.current ?? true;
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base text-foreground">
              Você tem certeza?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação não pode ser desfeita. Você será removido do processo
              seletivo.
              {quitProcessMutation.isError && (
                <span role="alert" className="mt-2 block text-destructive">
                  {withdrawalErrorMessage(
                    quitProcessMutation.error,
                    selected?.status,
                  )}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={quitProcessMutation.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (appToQuit) {
                  quitProcessMutation.mutate(appToQuit);
                }
              }}
              disabled={quitProcessMutation.isPending || cannotRetry}
            >
              {quitProcessMutation.isPending ? "Saindo..." : "Sair do processo"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface ApplicationCardProps {
  application: Application;
  onQuitProcess: (opener: HTMLElement) => void;
  isQuitPending: boolean;
}

function ApplicationCard({
  application,
  onQuitProcess,
  isQuitPending,
}: ApplicationCardProps) {
  const [showSimilar, setShowSimilar] = useState(false);
  const similarId = useId();
  const isClosed =
    application.status === "hired" ||
    application.status === "not_selected" ||
    application.status === "withdrawn" ||
    application.status === "expired";

  return (
    <Card
      role="article"
      aria-labelledby={applicationTitleId(application.id)}
      className={`overflow-hidden rounded-lg border border-border transition-colors ${isClosed ? "bg-muted" : "bg-background"}`}
    >
      <CardContent className="flex flex-col justify-between gap-6 p-6 md:flex-row md:gap-4">
        <div className="flex gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-input bg-accent text-base font-semibold text-foreground-2">
            {getCompanyInitials(application.company_name)}
          </div>

          <div className="space-y-1">
            <h2
              id={applicationTitleId(application.id)}
              tabIndex={-1}
              className="text-xl font-bold text-foreground"
            >
              {application.job_title} · {application.company_name}
            </h2>
            <p className="text-base text-muted-foreground">
              {getApplicationStatusLabel(application.status)}
            </p>

            <div className="pt-2 text-base text-foreground">
              <p>{getApplicationDescription(application)}</p>
              {application.status === "not_selected" && application.reason && (
                <p className="mt-2">Motivo: {application.reason}</p>
              )}
            </div>

            {application.status === "not_selected" &&
              application.similar_jobs.length > 0 && (
                <p className="pt-2 text-base text-foreground">
                  Há{" "}
                  <strong>
                    {application.similar_jobs.length}{" "}
                    {application.similar_jobs.length === 1
                      ? "vaga parecida"
                      : "vagas parecidas"}
                  </strong>{" "}
                  abertas agora.
                </p>
              )}
          </div>
        </div>

        <div className="flex min-w-[200px] flex-col justify-start gap-2">
          {application.status === "not_selected" ? (
            <Button
              variant="outline"
              className="w-full"
              aria-expanded={showSimilar}
              aria-controls={similarId}
              onClick={() => setShowSimilar(!showSimilar)}
            >
              Ver vagas parecidas
            </Button>
          ) : !isClosed ? (
            <>
              <Button variant="outline" disabled className="w-full">
                Ver a vaga
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={(event) => onQuitProcess(event.currentTarget)}
                disabled={isQuitPending}
              >
                {isQuitPending ? "Saindo..." : "Sair do processo"}
              </Button>
            </>
          ) : null}
        </div>
      </CardContent>
      {application.status === "not_selected" && (
        <div
          id={similarId}
          hidden={!showSimilar}
          className="px-6 pb-6 text-base"
        >
          <h3 className="mb-2 text-lg font-semibold">Vagas parecidas</h3>
          {application.similar_jobs.length === 0 ? (
            <p>Nenhuma vaga parecida disponível no momento.</p>
          ) : (
            <ul className="space-y-3">
              {application.similar_jobs.map((job) => (
                <li
                  key={job.id}
                  className="rounded-md border border-border p-4"
                >
                  <p className="font-semibold">{job.title}</p>
                  <p>{job.company_name}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

function applicationTitleId(applicationId: string): string {
  return `application-${applicationId}-title`;
}

function getCompanyInitials(companyName: string): string {
  const words = companyName.trim().split(/\s+/);

  if (words.length === 0 || !words[0]) {
    return "";
  }

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  const firstInitial = words[0][0] ?? "";
  const secondInitial = words[1]?.[0] ?? "";

  return `${firstInitial}${secondInitial}`.toUpperCase();
}

function getApplicationStatusLabel(status: ApplicationStatus): string {
  switch (status) {
    case "applied":
      return "Candidatura enviada";

    case "under_review":
      return "Em análise";

    case "in_selection_process":
      return "Em processo seletivo";

    case "hired":
      return "Você foi selecionado";

    case "not_selected":
      return "Você não foi selecionado";

    case "withdrawn":
      return "Você saiu do processo seletivo";

    case "expired":
      return "Candidatura expirada";
  }
}

function getApplicationDescription(application: Application): string {
  const submittedDate = formatDate(application.submitted_at);

  switch (application.status) {
    case "applied":
      return `Enviada em ${submittedDate} · ${application.days_in_process} dias em processo.`;

    case "under_review":
      return `Enviada em ${submittedDate} · ${application.days_in_process} dias em processo.`;

    case "in_selection_process":
      return `Enviada em ${submittedDate} · ${application.days_in_process} dias em processo.`;

    case "hired":
      return `Enviada em ${submittedDate}. A empresa selecionou você para a oportunidade.`;

    case "not_selected":
      return `Enviada em ${submittedDate}. A candidatura foi encerrada.`;

    case "withdrawn":
      return `Enviada em ${submittedDate}. Você optou por sair deste processo seletivo.`;

    case "expired":
      return `Enviada em ${submittedDate}. Esta candidatura não está mais ativa.`;
  }
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "numeric",
    month: "long",
  }).format(new Date(date));
}

function withdrawalErrorMessage(
  error: Error,
  status?: ApplicationStatus,
): string {
  if (status === "withdrawn") {
    return "A lista foi atualizada: você já saiu deste processo seletivo.";
  }
  if (
    error instanceof ApiError &&
    error.code === "application_already_closed"
  ) {
    return "Esta candidatura já foi encerrada. Confira o status atualizado na lista.";
  }
  if (error instanceof ApiError && error.code === "application_not_found") {
    return "Esta candidatura não está mais disponível. Atualize a lista para continuar.";
  }
  return "Não foi possível confirmar a saída do processo seletivo. Confira o status na lista antes de tentar novamente.";
}
