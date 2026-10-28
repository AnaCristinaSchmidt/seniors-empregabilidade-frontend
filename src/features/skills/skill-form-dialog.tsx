import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { type DefaultValues, useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { skillTypeLabels, skillTypes } from "@/lib/skill-type";

import {
  type CatalogSkill,
  catalogSkillsQueryKey,
  createCatalogSkill,
  isSkillNameConflict,
  SKILL_NAME_MAX_LENGTH,
  skillSaveErrorMessage,
  type SkillValues,
  skillValuesSchema,
  updateCatalogSkill,
} from "./skill-catalog-api";

const choiceClassName = "flex min-h-11 items-center gap-2 text-lg";
const radioClassName = "size-5 shrink-0 accent-primary";

interface SkillFormDialogProps {
  /** The catalog entry to edit; without it the dialog adds a new one. */
  skill?: CatalogSkill;
  onSaved: (message: string) => void;
}

// A new skill starts without a type so the administrator classifies it on
// purpose instead of accepting a default.
function initialValues(skill?: CatalogSkill): DefaultValues<SkillValues> {
  return skill ? { name: skill.name, type: skill.type } : { name: "" };
}

export function SkillFormDialog({ skill, onSaved }: SkillFormDialogProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const uid = useId();
  const nameId = `${uid}-name`;
  const nameErrorId = `${uid}-name-error`;
  const typeHintId = `${uid}-type-hint`;
  const typeErrorId = `${uid}-type-error`;
  const {
    register,
    handleSubmit,
    reset,
    setError,
    setFocus,
    formState: { errors },
  } = useForm<SkillValues>({
    resolver: zodResolver(skillValuesSchema),
    defaultValues: initialValues(skill),
  });
  const mutation = useMutation({
    mutationFn: (values: SkillValues) =>
      skill ? updateCatalogSkill(skill.id, values) : createCatalogSkill(values),
    onSuccess: async (saved) => {
      setOpen(false);
      onSaved(
        skill
          ? `Competência “${saved.name}” atualizada.`
          : `Competência “${saved.name}” cadastrada.`,
      );
      await queryClient.invalidateQueries({ queryKey: catalogSkillsQueryKey });
    },
    onError: (error) => {
      // A duplicate name belongs to the field; other failures go below the form.
      if (isSkillNameConflict(error)) {
        setError("name", {
          type: "server",
          message: skillSaveErrorMessage(error),
        });
      }
    },
  });
  const pending = mutation.isPending;
  const nameConflict = mutation.isError && isSkillNameConflict(mutation.error);

  // The field is still disabled while onError runs, so it can only take focus
  // once the form is enabled again.
  useEffect(() => {
    if (nameConflict) setFocus("name");
  }, [nameConflict, setFocus]);
  const nameProblem = errors.name?.message;
  const typeProblem = errors.type?.message;
  const failure =
    mutation.isError && !nameConflict
      ? skillSaveErrorMessage(mutation.error)
      : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (pending) return;
        if (nextOpen) {
          // Each opening starts from the stored entry, not from a draft that
          // was cancelled earlier.
          reset(initialValues(skill));
          mutation.reset();
        }
        setOpen(nextOpen);
      }}
    >
      <DialogTrigger
        render={
          skill ? (
            <Button
              type="button"
              variant="outline"
              aria-label={`Editar ${skill.name}`}
            >
              Editar
            </Button>
          ) : (
            <Button type="button">Nova competência</Button>
          )
        }
      />
      <DialogContent showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>
            {skill ? "Editar competência" : "Nova competência"}
          </DialogTitle>
          <DialogDescription>
            {skill
              ? "A alteração vale também para os currículos e as vagas que já usam esta competência."
              : "A competência passa a aparecer nas sugestões para profissionais e empresas."}
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="space-y-6"
          onSubmit={(event) => {
            void handleSubmit((values) => mutation.mutate(values))(event);
          }}
        >
          <div className="space-y-2">
            <Label htmlFor={nameId}>Nome *</Label>
            <Input
              {...register("name")}
              id={nameId}
              autoComplete="off"
              maxLength={SKILL_NAME_MAX_LENGTH}
              disabled={pending}
              aria-required="true"
              aria-invalid={Boolean(nameProblem)}
              aria-describedby={nameProblem ? nameErrorId : undefined}
            />
            {nameProblem ? (
              <p id={nameErrorId} role="alert" className="text-destructive">
                {nameProblem}
              </p>
            ) : null}
          </div>

          <fieldset
            className="min-w-0 space-y-2"
            aria-describedby={
              typeProblem ? `${typeHintId} ${typeErrorId}` : typeHintId
            }
          >
            <legend className="text-base leading-none font-medium">
              Tipo *
            </legend>
            <p id={typeHintId} className="text-base text-muted-foreground">
              Técnica é um conhecimento ou ferramenta, como Excel.
              Comportamental é um jeito de trabalhar, como trabalho em grupo.
            </p>
            <div className="flex flex-wrap gap-x-6">
              {skillTypes.map((type) => (
                <label key={type} className={choiceClassName}>
                  <input
                    {...register("type")}
                    type="radio"
                    value={type}
                    disabled={pending}
                    className={radioClassName}
                  />
                  {skillTypeLabels[type]}
                </label>
              ))}
            </div>
            {typeProblem ? (
              <p id={typeErrorId} role="alert" className="text-destructive">
                {typeProblem}
              </p>
            ) : null}
          </fieldset>

          {failure ? (
            <p role="alert" className="text-destructive">
              {failure}
            </p>
          ) : null}

          <DialogFooter>
            <DialogClose
              disabled={pending}
              render={
                <Button type="button" variant="outline">
                  Cancelar
                </Button>
              }
            />
            <Button type="submit" disabled={pending}>
              {pending
                ? "Salvando…"
                : skill
                  ? "Salvar alterações"
                  : "Cadastrar competência"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
