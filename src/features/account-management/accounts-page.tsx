import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import {
  type AccountDetail,
  type AccountEducation,
  type AccountExperience,
  type AccountFilters,
  type AccountStatusValues,
  type AccountSummary,
  type WritableAccountStatus,
  accountDetailQueryOptions,
  accountDisplayName,
  accountStatusLabels,
  accountStatusValuesSchema,
  accountsErrorMessage,
  accountsQueryKey,
  accountsQueryOptions,
  ACCOUNTS_PAGE_SIZE,
  changeAccountStatus,
  companyStatusLabels,
  completionLabel,
  defaultAccountFilters,
  REASON_MAX_LENGTH,
  statusChangeErrorMessage,
  userTypeLabels,
} from "./accounts-api";

const selectClassName =
  "h-12 w-full min-w-0 rounded-md border-[1.5px] border-input bg-background px-3.5 text-lg text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function AccountsPage() {
  const [filters, setFilters] = useState<AccountFilters>(defaultAccountFilters);
  const [notice, setNotice] = useState<{ id: number; message: string } | null>(
    null,
  );
  const accounts = useQuery(accountsQueryOptions(filters));
  const page = accounts.data;
  const userTypeId = useId();
  const accountStatusId = useId();
  const companyStatusId = useId();
  const completenessId = useId();

  function changeFilter<K extends keyof AccountFilters>(
    key: K,
    value: AccountFilters[K],
  ) {
    setFilters((current) => ({ ...current, [key]: value, offset: 0 }));
  }

  const rangeStart = page && page.items.length > 0 ? filters.offset + 1 : 0;
  const rangeEnd =
    page && page.items.length > 0 ? filters.offset + page.items.length : 0;
  const hasPrevious = filters.offset > 0;
  const hasNext = page
    ? filters.offset + page.items.length < page.total
    : false;

  return (
    <div className="min-h-full bg-muted p-4 pb-24 md:p-8 md:pb-24">
      <div className="mb-6 flex flex-col gap-1">
        <h1 className="text-3xl font-bold text-foreground">Cadastros</h1>
        <p className="text-lg text-muted-foreground">
          Consulte profissionais e empresas e bloqueie ou desbloqueie uma conta
          com justificativa.
        </p>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor={userTypeId}>Tipo</Label>
          <select
            id={userTypeId}
            className={selectClassName}
            value={filters.userType}
            onChange={(event) =>
              changeFilter(
                "userType",
                event.target.value as AccountFilters["userType"],
              )
            }
          >
            <option value="all">Profissionais e empresas</option>
            <option value="candidate">Profissionais</option>
            <option value="company">Empresas</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={accountStatusId}>Status da conta</Label>
          <select
            id={accountStatusId}
            className={selectClassName}
            value={filters.accountStatus}
            onChange={(event) =>
              changeFilter(
                "accountStatus",
                event.target.value as AccountFilters["accountStatus"],
              )
            }
          >
            <option value="all">Todos</option>
            <option value="active">Ativa</option>
            <option value="suspended">Suspensa</option>
            <option value="blocked">Bloqueada</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={companyStatusId}>Situação da empresa</Label>
          <select
            id={companyStatusId}
            className={selectClassName}
            value={filters.companyStatus}
            onChange={(event) =>
              changeFilter(
                "companyStatus",
                event.target.value as AccountFilters["companyStatus"],
              )
            }
          >
            <option value="all">Todas</option>
            <option value="pending">Pendente</option>
            <option value="approved">Aprovada</option>
            <option value="rejected">Recusada</option>
            <option value="blocked">Bloqueada</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={completenessId}>Currículo do profissional</Label>
          <select
            id={completenessId}
            className={selectClassName}
            value={filters.completeness}
            onChange={(event) =>
              changeFilter(
                "completeness",
                event.target.value as AccountFilters["completeness"],
              )
            }
          >
            <option value="all">Todos</option>
            <option value="complete">Completo</option>
            <option value="incomplete">Incompleto</option>
          </select>
        </div>
      </div>

      <p className="mb-6 max-w-3xl text-base text-muted-foreground">
        Os filtros se combinam. A situação da empresa lista só empresas;
        currículo lista só profissionais.
      </p>

      <div role="status">
        {notice ? (
          <p
            key={notice.id}
            className="mb-6 rounded-lg border border-success bg-background p-4 text-lg text-foreground"
          >
            {notice.message}
          </p>
        ) : null}
      </div>

      {accounts.isPending ? (
        <p className="text-lg text-muted-foreground">Carregando contas…</p>
      ) : accounts.isError ? (
        <div
          role="alert"
          className="flex max-w-xl flex-col items-start gap-4 rounded-lg border border-destructive bg-background p-6"
        >
          <p className="text-lg text-foreground">
            {accountsErrorMessage(accounts.error)}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => void accounts.refetch()}
          >
            Tentar novamente
          </Button>
        </div>
      ) : page && page.items.length === 0 ? (
        <p className="rounded-lg border-[1.5px] border-border bg-background p-6 text-lg text-muted-foreground">
          {filters.offset > 0
            ? "Não há mais contas nesta página. Volte para a página anterior."
            : "Nenhuma conta encontrada com esses filtros."}
        </p>
      ) : page ? (
        <div className="flex flex-col gap-4">
          <div
            role="region"
            aria-label="Tabela de cadastros"
            // A focusable scroll region supports keyboard scrolling in Safari.
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
            tabIndex={0}
            className="overflow-x-auto rounded-lg border-[1.5px] border-border bg-background focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <table className="w-full min-w-[56rem] border-collapse text-left">
              <caption className="sr-only">
                Contas de profissionais e empresas
              </caption>
              <thead className="border-b border-border bg-muted">
                <tr>
                  {[
                    "Nome",
                    "E-mail",
                    "Tipo",
                    "Status",
                    "Situação",
                    "Currículo",
                    "Cadastro",
                    "Ação",
                  ].map((heading) => (
                    <th
                      key={heading}
                      scope="col"
                      className="px-4 py-3 text-base font-semibold text-foreground"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {page.items.map((account) => (
                  <AccountRow
                    key={account.id}
                    account={account}
                    onChanged={(message) =>
                      setNotice((current) => ({
                        id: (current?.id ?? 0) + 1,
                        message,
                      }))
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
      {page && !accounts.isError && (page.total > 0 || hasPrevious) ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-base text-muted-foreground">
            {rangeStart}–{rangeEnd} de {page.total}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!hasPrevious}
              onClick={() =>
                setFilters((current) => ({
                  ...current,
                  offset: Math.max(0, current.offset - ACCOUNTS_PAGE_SIZE),
                }))
              }
            >
              Anterior
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!hasNext}
              onClick={() =>
                setFilters((current) => ({
                  ...current,
                  offset: current.offset + ACCOUNTS_PAGE_SIZE,
                }))
              }
            >
              Próxima
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AccountRow({
  account,
  onChanged,
}: {
  account: AccountSummary;
  onChanged: (message: string) => void;
}) {
  const name = accountDisplayName(account);
  const registered = new Date(account.created_at).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });

  return (
    <tr className="border-b border-border last:border-b-0">
      <th
        scope="row"
        className="px-4 py-3 text-lg font-semibold break-words text-foreground"
      >
        {name}
      </th>
      <td className="px-4 py-3 text-base break-words text-foreground">
        {account.email}
      </td>
      <td className="px-4 py-3 text-base text-foreground">
        {userTypeLabels[account.user_type]}
      </td>
      <td className="px-4 py-3 text-base text-foreground">
        {accountStatusLabels[account.account_status]}
      </td>
      <td className="px-4 py-3 text-base text-foreground">
        {account.company_status
          ? companyStatusLabels[account.company_status]
          : "—"}
      </td>
      <td className="px-4 py-3 text-base text-foreground">
        {completionLabel(account.missing_fields)}
      </td>
      <td className="px-4 py-3 text-base text-foreground">{registered}</td>
      <td className="px-4 py-3">
        <AccountDialog account={account} onChanged={onChanged} />
      </td>
    </tr>
  );
}

function AccountDialog({
  account,
  onChanged,
}: {
  account: AccountSummary;
  onChanged: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const reasonId = useId();
  const errorId = useId();
  const name = accountDisplayName(account);
  const blocking = account.account_status !== "blocked";
  const nextStatus: WritableAccountStatus = blocking ? "blocked" : "active";
  const actionLabel = blocking ? "Bloquear" : "Desbloquear";
  const detailQuery = useQuery({
    ...accountDetailQueryOptions(account.id),
    enabled: open,
  });
  const detail = detailQuery.data;
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AccountStatusValues>({
    resolver: zodResolver(accountStatusValuesSchema),
    defaultValues: { reason: "" },
  });
  const mutation = useMutation({
    mutationFn: (values: AccountStatusValues) =>
      changeAccountStatus(account.id, nextStatus, values),
    onSuccess: async () => {
      setOpen(false);
      reset();
      onChanged(
        blocking
          ? `Conta de ${name} bloqueada.`
          : `Conta de ${name} desbloqueada.`,
      );
      await queryClient.invalidateQueries({ queryKey: accountsQueryKey });
    },
  });
  const problem = errors.reason?.message;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (mutation.isPending) return;
        if (nextOpen) mutation.reset();
        setOpen(nextOpen);
      }}
    >
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="outline"
            aria-label={`Ver cadastro de ${name}`}
          >
            Ver cadastro
          </Button>
        }
      />
      <DialogContent
        className="sm:max-w-2xl"
        showCloseButton={!mutation.isPending}
      >
        <div className="flex max-h-[calc(100dvh-6rem)] min-h-0 flex-col gap-4">
          <DialogHeader className="shrink-0 pr-8">
            <div className="flex items-center gap-4">
              <span
                aria-hidden="true"
                className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent text-base font-semibold text-foreground"
              >
                {initials(name)}
              </span>
              <div className="flex flex-col gap-1">
                <DialogTitle>{name}</DialogTitle>
                <DialogDescription>
                  {registrationLine(account, detail)}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div
            role="region"
            aria-label="Dados do cadastro"
            // A focusable scroll region supports keyboard scrolling in Safari.
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
            tabIndex={0}
            className="min-h-0 overflow-y-auto rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {detailQuery.isPending && !detail ? (
              <p className="text-lg text-muted-foreground">
                Carregando cadastro…
              </p>
            ) : detailQuery.isError && !detail ? (
              <p role="alert" className="text-lg text-destructive">
                {accountsErrorMessage(detailQuery.error)}
              </p>
            ) : detail ? (
              account.user_type === "company" ? (
                <CompanyRegistration detail={detail} />
              ) : (
                <CandidateRegistration detail={detail} />
              )
            ) : null}
          </div>

          <form
            noValidate
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              void handleSubmit((values) => mutation.mutate(values))(event);
            }}
          >
            <div className="space-y-2">
              <Label htmlFor={reasonId}>Justificativa</Label>
              <Textarea
                {...register("reason")}
                id={reasonId}
                rows={3}
                maxLength={REASON_MAX_LENGTH}
                disabled={mutation.isPending}
                aria-invalid={Boolean(problem)}
                aria-describedby={problem ? errorId : undefined}
              />
              {problem ? (
                <p id={errorId} role="alert" className="text-destructive">
                  {problem}
                </p>
              ) : null}
            </div>
            {account.user_type === "company" ? (
              <p className="text-base text-muted-foreground">
                {blocking
                  ? "Enquanto a conta estiver bloqueada, as vagas dessa empresa saem da busca."
                  : "As vagas publicadas voltam a aparecer na busca."}
              </p>
            ) : null}
            {mutation.isError ? (
              <p role="alert" className="text-lg text-destructive">
                {statusChangeErrorMessage(mutation.error)}
              </p>
            ) : null}
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button
                type="submit"
                variant="outline"
                disabled={mutation.isPending}
                {...(blocking
                  ? {
                      className:
                        "border-destructive text-destructive hover:bg-accent",
                    }
                  : {})}
              >
                {mutation.isPending ? "Salvando..." : actionLabel}
              </Button>
              <DialogClose
                disabled={mutation.isPending}
                render={
                  <Button type="button" variant="outline">
                    Fechar
                  </Button>
                }
              />
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CandidateRegistration({ detail }: { detail: AccountDetail }) {
  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <h3 className="text-lg font-semibold text-foreground">Resumo</h3>
        <p className="text-lg break-words whitespace-pre-line text-foreground">
          {detail.summary ?? "Nenhum resumo informado."}
        </p>
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="text-lg font-semibold text-foreground">Experiência</h3>
        {detail.experiences.length === 0 ? (
          <p className="text-lg text-muted-foreground">
            Nenhuma experiência informada.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {detail.experiences.map((experience) => (
              <ExperienceItem key={experience.id} experience={experience} />
            ))}
          </ul>
        )}
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="text-lg font-semibold text-foreground">Formação</h3>
        {detail.education.length === 0 ? (
          <p className="text-lg text-muted-foreground">
            Nenhuma formação informada.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {detail.education.map((item) => (
              <li key={item.id} className="text-lg text-foreground">
                {educationLine(item)}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="text-lg font-semibold text-foreground">Habilidades</h3>
        {detail.skills.length === 0 ? (
          <p className="text-lg text-muted-foreground">
            Nenhuma habilidade informada.
          </p>
        ) : (
          <ul aria-label="Habilidades" className="flex flex-wrap gap-2">
            {detail.skills.map((skill) => (
              <li
                key={skill.id}
                className="rounded-full border border-border bg-background px-3 py-1.5 text-base text-foreground"
              >
                {skill.name}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ExperienceItem({ experience }: { experience: AccountExperience }) {
  return (
    <li className="grid grid-cols-[7.5rem_1fr] gap-3">
      <p className="text-base text-muted-foreground">
        {period(experience.start_date, experience.end_date)}
      </p>
      <p className="text-lg text-foreground">
        <span className="font-semibold">{experience.role}</span>
        {" · "}
        {experience.company_name}
      </p>
    </li>
  );
}

function CompanyRegistration({ detail }: { detail: AccountDetail }) {
  const place = [detail.city, detail.state].filter(Boolean).join("/");
  const rows = [
    ["Razão social", detail.legal_name],
    ["Nome fantasia", detail.trade_name],
    ["CNPJ", detail.cnpj ? formatCnpj(detail.cnpj) : null],
    ["E-mail da conta", detail.email],
    [
      "E-mail corporativo",
      detail.corporate_email && detail.corporate_email !== detail.email
        ? detail.corporate_email
        : null,
    ],
    ["Cidade", place === "" ? null : place],
    ["Setor", detail.industry],
    [
      "Porte",
      detail.company_size ? companySizeLabel(detail.company_size) : null,
    ],
    ["Status da conta", accountStatusLabels[detail.account_status]],
    [
      "Situação",
      detail.company_status ? companyStatusLabels[detail.company_status] : null,
    ],
  ].filter(
    (row): row is [string, string] =>
      typeof row[1] === "string" && row[1] !== "",
  );

  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="flex flex-col gap-1">
          <dt className="text-base text-muted-foreground">{label}</dt>
          <dd className="text-lg break-words text-foreground">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function initials(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .slice(0, 2)
    .map((part) => part[0] ?? "");
  const value = letters.join("").toLocaleUpperCase("pt-BR");
  return value === "" ? "?" : value;
}

function registeredOn(value: string): string {
  return new Date(value)
    .toLocaleDateString("pt-BR", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "America/Sao_Paulo",
    })
    .replaceAll(" de ", " ")
    .replaceAll(".", "");
}

function registrationLine(
  account: AccountSummary,
  detail: AccountDetail | undefined,
): string {
  const registered =
    account.user_type === "company" ? "Cadastrada" : "Cadastrado";
  const when = `${registered} em ${registeredOn(account.created_at)}`;
  if (account.user_type === "candidate") {
    const count = detail?.application_count;
    const applications =
      count === undefined || count === null
        ? null
        : count === 1
          ? "1 candidatura"
          : `${count} candidaturas`;
    const profile = completionLabel(
      detail?.missing_fields ?? account.missing_fields,
    ).toLocaleLowerCase("pt-BR");
    return [when, applications, profile]
      .filter((part) => part !== null)
      .join(" · ");
  }
  const jobs = detail?.published_job_count;
  const published =
    jobs === undefined || jobs === null
      ? null
      : jobs === 1
        ? "1 vaga publicada"
        : `${jobs} vagas publicadas`;
  const situation = account.company_status
    ? `situação ${companyStatusLabels[account.company_status].toLocaleLowerCase("pt-BR")}`
    : null;
  return [when, published, situation]
    .filter((part) => part !== null)
    .join(" · ");
}

function period(start: string, end: string | null): string {
  const startYear = start.slice(0, 4);
  return end === null
    ? `${startYear} – atual`
    : `${startYear} – ${end.slice(0, 4)}`;
}

function educationLine(item: AccountEducation): string {
  const course = [item.degree, item.field].filter(Boolean).join(" em ");
  const year = (item.end_date ?? item.start_date)?.slice(0, 4);
  return [course === "" ? null : course, item.institution, year]
    .filter((part) => part !== null && part !== undefined)
    .join(" · ");
}

function formatCnpj(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 14) return value;
  return digits.replace(
    /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
    "$1.$2.$3/$4-$5",
  );
}

function companySizeLabel(value: string): string {
  const labels: Record<string, string> = {
    micro: "Microempresa",
    small: "Pequena",
    medium: "Média",
    large: "Grande",
  };
  return labels[value] ?? value;
}
