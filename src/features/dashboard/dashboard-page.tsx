import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  type DashboardFilters,
  dashboardQueryOptions,
  emptyDashboardFilters,
} from "./dashboard-api";

const selectClassName =
  "h-12 w-full rounded-md border border-input bg-background px-3 text-lg text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring";
const indicators = [
  ["candidates", "Profissionais"],
  ["companies", "Empresas"],
  ["jobs", "Vagas"],
  ["applications", "Candidaturas"],
  ["matches", "Matches"],
  ["candidates_without_placement", "Profissionais sem colocação"],
  ["candidates_with_unknown_employment", "Situação profissional não informada"],
  ["incomplete_resumes", "Currículos incompletos"],
] as const;
const jobStatuses = {
  draft: "Rascunho",
  under_review: "Em revisão",
  published: "Publicada",
  paused: "Pausada",
  expired: "Expirada",
  closed: "Encerrada",
};
const applicationStatuses = {
  applied: "Enviada",
  under_review: "Em análise",
  in_selection_process: "Em seleção",
  hired: "Contratado",
  not_selected: "Não selecionado",
  withdrawn: "Desistência",
  expired: "Expirada",
};

export function DashboardPage() {
  const [draft, setDraft] = useState<DashboardFilters>(emptyDashboardFilters);
  const [filters, setFilters] = useState<DashboardFilters>(
    emptyDashboardFilters,
  );
  const [error, setError] = useState("");
  const dashboard = useQuery(dashboardQueryOptions(filters));
  const values = dashboard.data
    ? { ...dashboard.data.totals, ...dashboard.data.segments }
    : undefined;
  const changed = Object.keys(draft).some(
    (key) =>
      draft[key as keyof DashboardFilters] !==
      filters[key as keyof DashboardFilters],
  );
  function field(name: keyof DashboardFilters, value: string) {
    setDraft((current) => ({ ...current, [name]: value }));
    setError("");
  }
  function apply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      draft.start_date &&
      draft.end_date &&
      draft.start_date > draft.end_date
    ) {
      setError("A data inicial não pode ser posterior à data final.");
      return;
    }
    setFilters({ ...draft });
    setError("");
  }
  return (
    <div className="min-h-full bg-muted p-4 pb-24 md:p-8 md:pb-24">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            Relatórios da plataforma
          </h1>
          <p className="mt-2 text-lg text-muted-foreground">
            Acompanhe os cadastros, as oportunidades e as candidaturas.
          </p>
        </div>
      </div>
      <form
        onSubmit={apply}
        className="mb-6 space-y-4 rounded-lg border border-border bg-background p-5"
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="dashboard-start">Data inicial</Label>
            <Input
              id="dashboard-start"
              type="date"
              value={draft.start_date}
              onChange={(e) => field("start_date", e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "dashboard-filter-error" : undefined}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dashboard-end">Data final</Label>
            <Input
              id="dashboard-end"
              type="date"
              value={draft.end_date}
              onChange={(e) => field("end_date", e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "dashboard-filter-error" : undefined}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dashboard-account-status">Status das contas</Label>
            <select
              id="dashboard-account-status"
              className={selectClassName}
              value={draft.account_status}
              onChange={(e) => field("account_status", e.target.value)}
            >
              <option value="">Todos</option>
              <option value="active">Ativas</option>
              <option value="blocked">Bloqueadas</option>
              <option value="suspended">Suspensas</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="dashboard-availability">
              Disponibilidade do profissional
            </Label>
            <select
              id="dashboard-availability"
              className={selectClassName}
              value={draft.candidate_availability}
              onChange={(e) => field("candidate_availability", e.target.value)}
            >
              <option value="">Todas</option>
              <option value="available">Disponível</option>
              <option value="unavailable">Indisponível</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="dashboard-company-status">
              Situação da empresa
            </Label>
            <select
              id="dashboard-company-status"
              className={selectClassName}
              value={draft.company_status}
              onChange={(e) => field("company_status", e.target.value)}
            >
              <option value="">Todas</option>
              <option value="pending">Pendente</option>
              <option value="approved">Aprovada</option>
              <option value="rejected">Recusada</option>
              <option value="blocked">Bloqueada</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="dashboard-job-status">Status das vagas</Label>
            <select
              id="dashboard-job-status"
              className={selectClassName}
              value={draft.job_status}
              onChange={(e) => field("job_status", e.target.value)}
            >
              <option value="">Todos</option>
              {Object.entries(jobStatuses).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="dashboard-application-status">
              Status das candidaturas
            </Label>
            <select
              id="dashboard-application-status"
              className={selectClassName}
              value={draft.application_status}
              onChange={(e) => field("application_status", e.target.value)}
            >
              <option value="">Todos</option>
              {Object.entries(applicationStatuses).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-base text-muted-foreground">
          O período considera a data de cadastro de cada registro, no horário de
          Brasília. Cada status filtra o respectivo indicador. Matches também
          respeitam os filtros de profissional, empresa e vaga; o status da
          candidatura altera somente a contagem de candidaturas.
        </p>
        {error ? (
          <p
            id="dashboard-filter-error"
            role="alert"
            className="text-base text-destructive"
          >
            {error}
          </p>
        ) : null}
        {changed ? (
          <p role="status" className="text-base text-muted-foreground">
            Aplique os filtros para atualizar os números.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <Button type="submit">Aplicar filtros</Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setDraft(emptyDashboardFilters);
              setFilters(emptyDashboardFilters);
              setError("");
            }}
          >
            Limpar filtros
          </Button>
        </div>
      </form>
      {dashboard.isPending ? (
        <p role="status">Carregando indicadores...</p>
      ) : null}
      {dashboard.isFetching && !dashboard.isPending ? (
        <p role="status">Atualizando indicadores...</p>
      ) : null}
      {dashboard.isError ? (
        <div className="space-y-3">
          <p role="alert" className="text-lg text-destructive">
            Não foi possível carregar os indicadores. Tente novamente.
          </p>
          <Button variant="outline" onClick={() => void dashboard.refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : null}
      {dashboard.data && !dashboard.isError ? (
        <>
          {dashboard.data.totals.candidates +
            dashboard.data.totals.companies +
            dashboard.data.totals.jobs +
            dashboard.data.totals.applications ===
          0 ? (
            <p role="status" className="mb-4 text-lg">
              Nenhum registro encontrado com estes filtros.
            </p>
          ) : null}
          <dl
            aria-label="Indicadores da plataforma"
            aria-busy={dashboard.isFetching}
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
          >
            {indicators.map(([key, label]) => (
              <div
                key={key}
                className="min-w-0 space-y-3 rounded-lg border border-border bg-background p-5"
              >
                <dt className="text-lg font-semibold text-muted-foreground">
                  {label}
                </dt>
                <dd
                  data-indicator={key}
                  className="text-3xl font-bold text-foreground"
                >
                  {values?.[key].toLocaleString("pt-BR")}
                </dd>
              </div>
            ))}
          </dl>
        </>
      ) : null}
      <section
        aria-label="Como os indicadores são calculados"
        className="mt-6 space-y-2 text-base text-muted-foreground"
      >
        <h2 className="text-xl font-bold text-foreground">
          Como ler os números
        </h2>
        <p>
          Matches são pares entre profissional ativo e vaga aberta de empresa
          aprovada e ativa, com pelo menos 50% das habilidades exigidas. O
          período é aplicado aos dois cadastros. Um profissional pode ter mais
          de um match.
        </p>
        <p>
          'Sem colocação' conta a situação profissional registrada como
          desempregado. Quem não informou a situação aparece separado.
        </p>
        <p>
          Currículos incompletos seguem a regra da assistência ao currículo:
          cidade, estado, resumo, experiência, formação e habilidades.
        </p>
      </section>
    </div>
  );
}
