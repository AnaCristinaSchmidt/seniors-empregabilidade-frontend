import { useQuery } from "@tanstack/react-query";
import { CheckIcon, PlusIcon, XIcon } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

import {
  SKILL_CATALOG_LIMIT,
  MAX_SELECTED_SKILLS,
  skillCatalogQueryOptions,
} from "./professional-profile";
import type { Skill } from "./professional-profile-schema";
import { SectionHeading } from "./section-heading";

const SEARCH_DELAY_MS = 250;
const LOADING_PLACEHOLDERS = 6;

// Case- and accent-insensitive, like the catalog search on the backend.
function comparableSkillName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

interface SkillSelectionProps {
  selected: Skill[];
  onChange: (skills: Skill[]) => void;
  /** Locks the selection while the résumé is being saved. */
  disabled?: boolean;
}

/**
 * Picks the résumé's skills from the catalog. The selection stays on screen
 * until the résumé is saved, so the person can change it freely before
 * "Salvar alterações".
 */
export function SkillSelection({
  selected,
  onChange,
  disabled = false,
}: SkillSelectionProps) {
  const [term, setTerm] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const search = useDebouncedValue(term.trim(), SEARCH_DELAY_MS);
  const catalog = useQuery(skillCatalogQueryOptions(search));
  const headingId = useId();
  const hintId = useId();
  const inputId = useId();
  const selectedLabelId = useId();

  const selectedIds = new Set(selected.map((skill) => skill.id));
  const results = catalog.data ?? [];
  const atLimit = selected.length >= MAX_SELECTED_SKILLS;

  function deselect(skill: Skill) {
    if (disabled) return;
    setNotice(null);
    onChange(selected.filter((item) => item.id !== skill.id));
  }

  function toggle(skill: Skill) {
    if (disabled) return;
    if (selectedIds.has(skill.id)) {
      deselect(skill);
      return;
    }
    if (atLimit) return;
    setNotice(null);
    onChange([...selected, skill]);
  }

  // Enter picks the catalog skill named as typed, or the only one the search
  // found, instead of submitting the whole résumé.
  function selectTypedSkill() {
    if (disabled) return;
    const typed = comparableSkillName(term);
    if (!typed) {
      return;
    }
    const isCurrent = search === term.trim() && !catalog.isPlaceholderData;
    const choice =
      results.find((skill) => comparableSkillName(skill.name) === typed) ??
      (isCurrent && results.length === 1 ? results[0] : undefined);
    if (!choice) {
      setNotice("Escolha uma das habilidades da lista do catálogo.");
      return;
    }
    if (selectedIds.has(choice.id)) {
      setNotice(`${choice.name} já está entre as selecionadas.`);
      return;
    }
    if (atLimit) {
      setNotice(
        `Você pode selecionar até ${MAX_SELECTED_SKILLS} habilidades. Remova uma para escolher outra.`,
      );
      return;
    }
    onChange([...selected, choice]);
    setTerm("");
    setNotice(`${choice.name} selecionada.`);
  }

  function catalogStatus(): string | null {
    if (catalog.isPending) {
      return "Carregando o catálogo de habilidades...";
    }
    if (catalog.isError) {
      return null;
    }
    if (catalog.isPlaceholderData) {
      return "Buscando habilidades...";
    }
    if (results.length === 0) {
      return search
        ? `Nenhuma habilidade encontrada para “${search}”. Tente outra palavra.`
        : "O catálogo de habilidades ainda está vazio.";
    }
    if (results.length >= SKILL_CATALOG_LIMIT) {
      return `Mostrando as primeiras ${SKILL_CATALOG_LIMIT} habilidades. Digite parte do nome para encontrar outras.`;
    }
    if (search) {
      return results.length === 1
        ? "1 habilidade encontrada."
        : `${results.length} habilidades encontradas.`;
    }
    return null;
  }

  return (
    <div role="group" aria-labelledby={headingId}>
      <SectionHeading id={headingId}>Habilidades</SectionHeading>
      <p id={hintId} className="mt-1 text-base text-muted-foreground">
        Escolha até {MAX_SELECTED_SKILLS} habilidades do catálogo. As vagas
        comparam essas habilidades com os requisitos de cada uma. Elas são
        salvas junto com o perfil, em “Salvar alterações”.
      </p>

      <p
        id={selectedLabelId}
        className="mt-4 text-base font-semibold text-foreground"
      >
        Selecionadas ({selected.length})
      </p>
      {selected.length === 0 ? (
        <p className="mt-2 text-lg text-muted-foreground">
          Nenhuma habilidade selecionada ainda.
        </p>
      ) : (
        <ul
          aria-labelledby={selectedLabelId}
          className="mt-2 flex flex-wrap gap-2"
        >
          {selected.map((skill) => (
            <li
              key={skill.id}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-accent py-1 pr-1 pl-3 text-base text-foreground"
            >
              <span>{skill.name}</span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => deselect(skill)}
                aria-label={`Remover habilidade ${skill.name}`}
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-full outline-none hover:bg-background focus-visible:ring-3 focus-visible:ring-ring/50 disabled:text-disabled-foreground"
              >
                <XIcon className="size-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Field className="mt-4">
        <FieldLabel htmlFor={inputId}>Buscar no catálogo</FieldLabel>
        <Input
          id={inputId}
          disabled={disabled}
          value={term}
          autoComplete="off"
          placeholder="Ex.: Excel, atendimento ao cliente"
          aria-describedby={hintId}
          onChange={(event) => {
            setTerm(event.target.value);
            setNotice(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && term) {
              event.preventDefault();
              event.stopPropagation();
              setTerm("");
              setNotice(null);
              return;
            }
            if (event.key === "Enter") {
              event.preventDefault();
              selectTypedSkill();
            }
          }}
        />
      </Field>

      {catalog.isPending ? (
        <div aria-hidden="true" className="mt-3 flex flex-wrap gap-2">
          {Array.from({ length: LOADING_PLACEHOLDERS }, (_, index) => (
            <Skeleton
              key={index}
              className="h-11 w-32 rounded-full bg-accent motion-reduce:animate-none"
            />
          ))}
        </div>
      ) : null}

      {catalog.isError ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p role="alert" className="text-base text-destructive">
            Não foi possível carregar o catálogo de habilidades.
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={catalog.isFetching}
            onClick={() => void catalog.refetch()}
          >
            {catalog.isFetching ? "Carregando..." : "Tentar novamente"}
          </Button>
        </div>
      ) : null}

      {results.length > 0 ? (
        <ul
          aria-label="Catálogo de habilidades"
          className="mt-3 flex flex-wrap gap-2"
        >
          {results.map((skill) => {
            const isSelected = selectedIds.has(skill.id);
            return (
              <li key={skill.id}>
                <Button
                  type="button"
                  variant="outline"
                  aria-pressed={isSelected}
                  disabled={disabled || (atLimit && !isSelected)}
                  onClick={() => toggle(skill)}
                  className="h-auto min-h-11 rounded-full text-left whitespace-normal aria-pressed:border-foreground aria-pressed:bg-accent"
                >
                  {isSelected ? (
                    <CheckIcon aria-hidden="true" />
                  ) : (
                    <PlusIcon aria-hidden="true" />
                  )}
                  {skill.name}
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <p
        role="status"
        className="mt-2 text-base text-muted-foreground empty:mt-0"
      >
        {notice ??
          (atLimit
            ? `Você pode selecionar até ${MAX_SELECTED_SKILLS} habilidades. Remova uma para escolher outra.`
            : catalogStatus())}
      </p>
    </div>
  );
}
