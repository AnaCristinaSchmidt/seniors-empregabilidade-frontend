import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { skillTypeLabels } from "@/lib/skill-type";

import {
  type CatalogSkill,
  catalogSkillsErrorMessage,
  catalogSkillsQueryOptions,
  defaultSkillFilters,
  SKILL_NAME_MAX_LENGTH,
  type SkillFilters,
  SKILLS_PAGE_SIZE,
  skillStatusLabels,
} from "./skill-catalog-api";
import { SkillFormDialog } from "./skill-form-dialog";
import { SkillStatusAction } from "./skill-status-action";

const SEARCH_DELAY_MS = 300;

const selectClassName =
  "h-12 w-full min-w-0 rounded-md border-[1.5px] border-input bg-background px-3.5 text-lg text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function SkillCatalogPage() {
  const [filters, setFilters] = useState<SkillFilters>(defaultSkillFilters);
  const [notice, setNotice] = useState<{ id: number; message: string } | null>(
    null,
  );
  const search = useDebouncedValue(filters.search.trim(), SEARCH_DELAY_MS);
  const skills = useQuery(catalogSkillsQueryOptions({ ...filters, search }));
  const page = skills.data;
  const searchId = useId();
  const typeId = useId();
  const statusId = useId();

  function changeFilter<K extends keyof SkillFilters>(
    key: K,
    value: SkillFilters[K],
  ) {
    setFilters((current) => ({ ...current, [key]: value, offset: 0 }));
  }

  function announce(message: string) {
    setNotice((current) => ({ id: (current?.id ?? 0) + 1, message }));
  }

  const filtered =
    search !== "" || filters.type !== "all" || filters.status !== "all";
  const rangeStart = page && page.items.length > 0 ? filters.offset + 1 : 0;
  const rangeEnd =
    page && page.items.length > 0 ? filters.offset + page.items.length : 0;
  const hasPrevious = filters.offset > 0;
  const hasNext = page
    ? filters.offset + page.items.length < page.total
    : false;

  return (
    <div className="min-h-full bg-muted p-4 pb-24 md:p-8 md:pb-24">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-3xl font-bold text-foreground">Competências</h1>
          <p className="text-lg text-muted-foreground">
            Mantenha o catálogo usado nos currículos e nas vagas: cadastre,
            corrija ou inative competências.
          </p>
        </div>
        <SkillFormDialog onSaved={announce} />
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="space-y-2 sm:col-span-2 xl:col-span-1">
          <Label htmlFor={searchId}>Buscar por nome</Label>
          <Input
            id={searchId}
            type="search"
            autoComplete="off"
            maxLength={SKILL_NAME_MAX_LENGTH}
            value={filters.search}
            onChange={(event) => changeFilter("search", event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={typeId}>Tipo</Label>
          <select
            id={typeId}
            className={selectClassName}
            value={filters.type}
            onChange={(event) =>
              changeFilter("type", event.target.value as SkillFilters["type"])
            }
          >
            <option value="all">Todos</option>
            <option value="hard">Técnica</option>
            <option value="soft">Comportamental</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={statusId}>Situação</Label>
          <select
            id={statusId}
            className={selectClassName}
            value={filters.status}
            onChange={(event) =>
              changeFilter(
                "status",
                event.target.value as SkillFilters["status"],
              )
            }
          >
            <option value="all">Todas</option>
            <option value="active">Ativa</option>
            <option value="inactive">Inativa</option>
          </select>
        </div>
      </div>

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

      {skills.isPending ? (
        <p className="text-lg text-muted-foreground">
          Carregando competências…
        </p>
      ) : skills.isError ? (
        <div
          role="alert"
          className="flex max-w-xl flex-col items-start gap-4 rounded-lg border border-destructive bg-background p-6"
        >
          <p className="text-lg text-foreground">
            {catalogSkillsErrorMessage(skills.error)}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => void skills.refetch()}
          >
            Tentar novamente
          </Button>
        </div>
      ) : page && page.items.length === 0 ? (
        <p className="rounded-lg border-[1.5px] border-border bg-background p-6 text-lg text-muted-foreground">
          {filters.offset > 0
            ? "Não há mais competências nesta página. Volte para a página anterior."
            : filtered
              ? "Nenhuma competência encontrada com esses filtros."
              : "O catálogo ainda não tem competências. Cadastre a primeira."}
        </p>
      ) : page ? (
        <div
          role="region"
          aria-label="Tabela de competências"
          // A focusable scroll region supports keyboard scrolling in Safari.
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
          tabIndex={0}
          className="overflow-x-auto rounded-lg border-[1.5px] border-border bg-background focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <table className="w-full min-w-[40rem] border-collapse text-left">
            <caption className="sr-only">Competências do catálogo</caption>
            <thead className="border-b border-border bg-muted">
              <tr>
                {["Competência", "Tipo", "Situação", "Ações"].map((heading) => (
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
              {page.items.map((skill) => (
                <SkillRow key={skill.id} skill={skill} onChanged={announce} />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {page && !skills.isError && (page.total > 0 || hasPrevious) ? (
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
                  offset: Math.max(0, current.offset - SKILLS_PAGE_SIZE),
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
                  offset: current.offset + SKILLS_PAGE_SIZE,
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

function SkillRow({
  skill,
  onChanged,
}: {
  skill: CatalogSkill;
  onChanged: (message: string) => void;
}) {
  return (
    <tr className="border-b border-border last:border-b-0">
      <th
        scope="row"
        className="px-4 py-3 text-lg font-semibold break-words text-foreground"
      >
        {skill.name}
      </th>
      <td className="px-4 py-3 text-base text-foreground">
        {skillTypeLabels[skill.type]}
      </td>
      <td className="px-4 py-3 text-base text-foreground">
        {skillStatusLabels[skill.status]}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-2">
          <SkillFormDialog skill={skill} onSaved={onChanged} />
          <SkillStatusAction skill={skill} onChanged={onChanged} />
        </div>
      </td>
    </tr>
  );
}
