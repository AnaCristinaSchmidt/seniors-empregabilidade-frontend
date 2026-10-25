import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { XIcon } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { type DefaultValues, useForm, useWatch } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { DialogClose, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

import { skillTypeLabels, workModeLabels } from "./job-labels";
import {
  jobEditSchema,
  jobPostingSchema,
  type JobPostingValues,
  type JobSkill,
  MAX_SKILL_NAME_LENGTH,
  normalizeSkillName,
  type SkillType,
  skillTypes,
  todayIsoDate,
  workModes,
} from "./job-posting-schema";
import {
  MIN_SKILL_SEARCH_LENGTH,
  skillSuggestionsQueryOptions,
} from "./jobs-api";
import type { JobPostingFailure } from "./jobs-errors";

const SUGGESTION_DELAY_MS = 300;

const choiceClassName = "flex min-h-11 items-center gap-2 text-lg";
const radioClassName = "size-5 shrink-0 accent-primary";

export interface JobPostingFormProps {
  /**
   * "create" asks for every field. "edit" asks for the title, the optional
   * description and the skills; the work mode and the closing date keep the
   * values given in `defaultValues`, unshown and unchecked.
   */
  mode: "create" | "edit";
  defaultValues: DefaultValues<JobPostingValues>;
  submitLabel: string;
  pendingLabel: string;
  /** True while the caller's request is in flight. */
  pending: boolean;
  /** Saves the values; rejects when the API refused them or was unreachable. */
  onSubmit: (values: JobPostingValues) => Promise<void>;
  /** Turns the rejection into the Portuguese message and the field errors. */
  describeFailure: (error: unknown) => JobPostingFailure;
  /**
   * Extra footer content before Cancel, given whether the form is busy and
   * whether it holds changes not saved yet.
   */
  footerStart?: (state: { busy: boolean; dirty: boolean }) => ReactNode;
}

/**
 * The job form shared by the posting and the editing modals. It must render
 * inside a Dialog: its Cancel button is the Dialog's close.
 */
export function JobPostingForm({
  mode,
  defaultValues,
  submitLabel,
  pendingLabel,
  pending,
  onSubmit,
  describeFailure,
  footerStart,
}: JobPostingFormProps) {
  const [skillDraft, setSkillDraft] = useState("");
  const [skillType, setSkillType] = useState<SkillType>("hard");
  const [generalError, setGeneralError] = useState<string | null>(null);
  const uid = useId();
  const titleId = `${uid}-title`;
  const titleErrorId = `${uid}-title-error`;
  const descriptionId = `${uid}-description`;
  const descriptionErrorId = `${uid}-description-error`;
  const workModeErrorId = `${uid}-work-mode-error`;
  const closingDateId = `${uid}-closing-date`;
  const closingDateErrorId = `${uid}-closing-date-error`;
  const skillsInputId = `${uid}-skills`;
  const skillTypeName = `${uid}-skill-type`;
  const skillsSupportId = `${uid}-skills-support`;
  const skillsErrorId = `${uid}-skills-error`;
  const suggestionsLabelId = `${uid}-suggestions`;

  const form = useForm<JobPostingValues>({
    resolver:
      mode === "edit"
        ? zodResolver(jobEditSchema)
        : zodResolver(jobPostingSchema),
    defaultValues,
  });
  const { register, control, setValue, setError, formState, handleSubmit } =
    form;
  const { errors } = formState;
  const skills = useWatch({ control, name: "skills" }) ?? [];
  const addedNames = new Set(
    skills.map((skill) => normalizeSkillName(skill.name)),
  );

  const search = useDebouncedValue(skillDraft.trim(), SUGGESTION_DELAY_MS);
  const suggestions = useQuery(skillSuggestionsQueryOptions(search));
  // The previous suggestions stay cached while typing; once the field is
  // cleared they no longer describe what is being typed.
  const catalogMatches =
    skillDraft.trim().length >= MIN_SKILL_SEARCH_LENGTH
      ? (suggestions.data ?? []).filter(
          (skill) => !addedNames.has(normalizeSkillName(skill.name)),
        )
      : [];

  const busy = pending || formState.isSubmitting;
  const descriptionRequired = mode === "create";

  function addSkill(skill: JobSkill) {
    if (!addedNames.has(normalizeSkillName(skill.name))) {
      setValue("skills", [...skills, skill], {
        shouldValidate: true,
        shouldDirty: true,
      });
    }
    setSkillDraft("");
  }

  function addTypedSkill() {
    const name = skillDraft.trim().split(/\s+/).join(" ");
    if (!name) return;

    const normalized = normalizeSkillName(name);
    if (!normalized) {
      setError("skills", {
        type: "manual",
        message: "Digite uma habilidade com letras ou números.",
      });
      return;
    }

    // A name the catalog already has keeps its stored spelling and type.
    const known = suggestions.data?.find(
      (skill) => normalizeSkillName(skill.name) === normalized,
    );
    addSkill(
      known
        ? { name: known.name, type: known.type }
        : { name, type: skillType },
    );
  }

  function removeSkill(name: string) {
    setValue(
      "skills",
      skills.filter((skill) => skill.name !== name),
      { shouldValidate: true, shouldDirty: true },
    );
  }

  async function submit(values: JobPostingValues) {
    setGeneralError(null);
    try {
      await onSubmit(values);
    } catch (error) {
      const failure = describeFailure(error);
      setGeneralError(failure.message);
      for (const { field, message } of failure.fields) {
        setError(field, { type: "server", message });
      }
    }
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        void handleSubmit(submit)(event);
      }}
      className="space-y-6"
      aria-busy={busy}
    >
      <fieldset disabled={busy} className="min-w-0 space-y-6">
        <div className="space-y-2">
          <Label htmlFor={titleId}>Título da vaga *</Label>
          <Input
            {...register("title")}
            id={titleId}
            aria-required="true"
            aria-invalid={Boolean(errors.title)}
            aria-describedby={errors.title ? titleErrorId : undefined}
          />
          {errors.title && (
            <p id={titleErrorId} role="alert" className="text-destructive">
              {errors.title.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor={descriptionId}>
            {descriptionRequired ? "Descrição da vaga *" : "Descrição da vaga"}
          </Label>
          <textarea
            {...register("description")}
            id={descriptionId}
            rows={5}
            aria-required={descriptionRequired}
            aria-invalid={Boolean(errors.description)}
            aria-describedby={
              errors.description ? descriptionErrorId : undefined
            }
            className="w-full min-w-0 rounded-md border-[1.5px] border-input bg-transparent px-3.5 py-2 text-lg transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-disabled disabled:text-disabled-foreground aria-invalid:border-2 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20"
          />
          {errors.description && (
            <p
              id={descriptionErrorId}
              role="alert"
              className="text-destructive"
            >
              {errors.description.message}
            </p>
          )}
        </div>

        {mode === "create" && (
          <div className="grid gap-6 sm:grid-cols-2">
            <fieldset
              className="min-w-0"
              aria-describedby={errors.workMode ? workModeErrorId : undefined}
            >
              <legend className="text-base leading-none font-medium">
                Modalidade de trabalho *
              </legend>
              <div className="flex flex-wrap gap-x-6">
                {workModes.map((workMode) => (
                  <label key={workMode} className={choiceClassName}>
                    <input
                      {...register("workMode")}
                      type="radio"
                      value={workMode}
                      className={radioClassName}
                    />
                    {workModeLabels[workMode]}
                  </label>
                ))}
              </div>
              {errors.workMode && (
                <p
                  id={workModeErrorId}
                  role="alert"
                  className="text-destructive"
                >
                  {errors.workMode.message}
                </p>
              )}
            </fieldset>

            <div className="space-y-2">
              <Label htmlFor={closingDateId}>Data de encerramento *</Label>
              <Input
                {...register("closingDate")}
                id={closingDateId}
                type="date"
                min={todayIsoDate()}
                aria-required="true"
                aria-invalid={Boolean(errors.closingDate)}
                aria-describedby={
                  errors.closingDate ? closingDateErrorId : undefined
                }
              />
              {errors.closingDate && (
                <p
                  id={closingDateErrorId}
                  role="alert"
                  className="text-destructive"
                >
                  {errors.closingDate.message}
                </p>
              )}
            </div>
          </div>
        )}

        <div className="space-y-3">
          <Label htmlFor={skillsInputId}>Habilidades necessárias *</Label>
          <div className="flex gap-2">
            <Input
              id={skillsInputId}
              value={skillDraft}
              maxLength={MAX_SKILL_NAME_LENGTH}
              autoComplete="off"
              onChange={(event) => setSkillDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addTypedSkill();
                }
              }}
              placeholder="Ex.: Atendimento ao cliente"
              aria-invalid={Boolean(errors.skills)}
              aria-describedby={
                errors.skills?.message
                  ? `${skillsSupportId} ${skillsErrorId}`
                  : skillsSupportId
              }
            />
            <Button type="button" variant="outline" onClick={addTypedSkill}>
              Adicionar
            </Button>
          </div>

          <fieldset className="min-w-0">
            <legend className="text-base leading-none font-medium">
              Tipo da habilidade digitada
            </legend>
            <div className="flex flex-wrap gap-x-6">
              {skillTypes.map((type) => (
                <label key={type} className={choiceClassName}>
                  <input
                    type="radio"
                    name={skillTypeName}
                    value={type}
                    checked={skillType === type}
                    onChange={() => setSkillType(type)}
                    className={radioClassName}
                  />
                  {skillTypeLabels[type]}
                </label>
              ))}
            </div>
          </fieldset>

          {catalogMatches.length > 0 && (
            <div className="space-y-2">
              <p
                id={suggestionsLabelId}
                className="text-base text-muted-foreground"
              >
                Sugestões do catálogo
              </p>
              <ul
                aria-labelledby={suggestionsLabelId}
                className="flex flex-wrap gap-2"
              >
                {catalogMatches.map((skill) => (
                  <li key={skill.id}>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        addSkill({ name: skill.name, type: skill.type })
                      }
                      aria-label={`Adicionar ${skill.name} (${skillTypeLabels[skill.type]})`}
                    >
                      {skill.name}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {skills.length > 0 && (
            <ul
              className="flex flex-wrap gap-2"
              aria-label="Habilidades adicionadas"
            >
              {skills.map((skill) => (
                <li
                  key={normalizeSkillName(skill.name)}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-accent py-1 pr-1 pl-3 text-base text-foreground"
                >
                  <span>{skill.name}</span>
                  <span className="text-muted-foreground">
                    · {skillTypeLabels[skill.type]}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeSkill(skill.name)}
                    aria-label={`Remover habilidade ${skill.name}`}
                    className="inline-flex size-11 shrink-0 items-center justify-center rounded-full outline-none hover:bg-background focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <XIcon className="size-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p id={skillsSupportId} className="text-muted-foreground">
            Escolha uma sugestão ou digite a habilidade, marque o tipo e
            pressione Enter ou “Adicionar”. As habilidades definem o cálculo de
            compatibilidade mostrado ao candidato.
          </p>
          {errors.skills?.message && (
            <p id={skillsErrorId} role="alert" className="text-destructive">
              {errors.skills.message}
            </p>
          )}
        </div>
      </fieldset>

      {generalError && (
        <p role="alert" className="text-destructive">
          {generalError}
        </p>
      )}

      <DialogFooter>
        {footerStart?.({ busy, dirty: formState.isDirty })}
        <DialogClose
          disabled={busy}
          render={
            <Button type="button" variant="outline">
              Cancelar
            </Button>
          }
        />
        <Button type="submit" disabled={busy}>
          {busy ? pendingLabel : submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}
