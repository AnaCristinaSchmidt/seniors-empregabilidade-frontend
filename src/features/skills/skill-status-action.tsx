import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Button } from "@/components/ui/button";

import {
  type CatalogSkill,
  catalogSkillsQueryKey,
  changeCatalogSkillStatus,
  skillStatusErrorMessage,
} from "./skill-catalog-api";

interface SkillStatusActionProps {
  skill: CatalogSkill;
  onChanged: (message: string) => void;
}

export function SkillStatusAction({
  skill,
  onChanged,
}: SkillStatusActionProps) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const nextStatus = skill.status === "active" ? "inactive" : "active";

  const mutation = useMutation({
    mutationFn: () => changeCatalogSkillStatus(skill.id, nextStatus),
    retry: false,
    // A refused change may mean the entry changed elsewhere: the list shows
    // what the server has either way.
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: catalogSkillsQueryKey }),
  });
  const pending = mutation.isPending;

  async function submit() {
    try {
      await mutation.mutateAsync();
      setConfirming(false);
      onChanged(
        nextStatus === "inactive"
          ? `Competência “${skill.name}” inativada. Ela não aparece mais nas sugestões.`
          : `Competência “${skill.name}” reativada e de volta às sugestões.`,
      );
    } catch {
      // The message is rendered from mutation.error.
    }
  }

  function start() {
    mutation.reset();
    if (nextStatus === "inactive") {
      setConfirming(true);
      return;
    }
    void submit();
  }

  const failure = mutation.isError
    ? skillStatusErrorMessage(mutation.error, nextStatus)
    : null;

  return (
    <>
      {/* One button whose label follows the status keeps keyboard focus in
          place when the row is refreshed after the change. */}
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        aria-label={
          nextStatus === "inactive"
            ? `Inativar ${skill.name}`
            : `Reativar ${skill.name}`
        }
        onClick={start}
      >
        {nextStatus === "inactive"
          ? "Inativar"
          : pending
            ? "Reativando…"
            : "Reativar"}
      </Button>
      {failure && !confirming ? (
        <p role="alert" className="basis-full text-base text-destructive">
          {failure}
        </p>
      ) : null}

      <AlertDialog
        open={confirming}
        onOpenChange={(open) => {
          if (open || pending) return;
          setConfirming(false);
          mutation.reset();
        }}
      >
        <AlertDialogContent className="rounded-xl border-border bg-background">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold text-foreground">
              Inativar a competência?
            </AlertDialogTitle>
            <AlertDialogDescription>
              “{skill.name}” deixa de aparecer nas sugestões para profissionais
              e empresas. Os currículos e as vagas que já a usam continuam com
              ela, e você pode reativá-la depois.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {failure ? (
            <p role="alert" className="text-base text-destructive">
              {failure}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={pending} onClick={() => void submit()}>
              {pending ? "Inativando…" : "Inativar competência"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
