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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import {
  type CompletenessFilter,
  type ContactFilter,
  type Guidance,
  guidanceErrorMessage,
  type GuidanceValues,
  guidanceValuesSchema,
  missingFieldLabel,
  NOTE_MAX_LENGTH,
  recordGuidance,
  type ResumeFilters,
  type ResumeSummary,
  resumesErrorMessage,
  resumesQueryKey,
  resumesQueryOptions,
} from "./resume-assistance-api";

const selectClassName =
  "h-12 w-full rounded-md border-[1.5px] border-input bg-background px-3.5 text-lg text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function IncompleteResumesPage() {
  const [filters, setFilters] = useState<ResumeFilters>({
    completeness: "incomplete",
    contact: "all",
  });
  const [notice, setNotice] = useState<{ id: number; message: string } | null>(
    null,
  );
  const resumes = useQuery(resumesQueryOptions(filters));
  const completenessId = useId();
  const contactId = useId();

  return (
    <div className="min-h-full bg-muted p-4 md:p-8">
      <div className="mb-6 flex flex-col gap-1">
        <h1 className="text-3xl font-bold text-foreground">Candidatos</h1>
        <p className="text-lg text-muted-foreground">
          Encontre currículos incompletos e registre as orientações dadas a cada
          pessoa.
        </p>
      </div>

      <div className="mb-6 grid gap-4 sm:max-w-2xl sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={completenessId}>Currículo</Label>
          <select
            id={completenessId}
            className={selectClassName}
            value={filters.completeness}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                completeness: event.target.value as CompletenessFilter,
              }))
            }
          >
            <option value="incomplete">Incompletos</option>
            <option value="complete">Completos</option>
            <option value="all">Todos</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={contactId}>Contato</Label>
          <select
            id={contactId}
            className={selectClassName}
            value={filters.contact}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                contact: event.target.value as ContactFilter,
              }))
            }
          >
            <option value="all">Todos</option>
            <option value="not_contacted">Sem orientação registrada</option>
            <option value="contacted">Com orientação registrada</option>
          </select>
        </div>
      </div>

      {/* Rendered empty from the start so the confirmation is announced. */}
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

      {resumes.isPending ? (
        <p className="text-lg text-muted-foreground">Carregando currículos…</p>
      ) : resumes.isError ? (
        <div
          role="alert"
          className="flex max-w-xl flex-col items-start gap-4 rounded-lg border border-destructive bg-background p-6"
        >
          <p className="text-lg text-foreground">
            {resumesErrorMessage(resumes.error)}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => void resumes.refetch()}
          >
            Tentar novamente
          </Button>
        </div>
      ) : resumes.data.length === 0 ? (
        <p className="rounded-lg border-[1.5px] border-border bg-background p-6 text-lg text-muted-foreground">
          Nenhum currículo encontrado com esses filtros.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {resumes.data.map((resume) => (
            <li key={resume.id}>
              <ResumeCard
                resume={resume}
                onRecorded={() =>
                  setNotice((current) => ({
                    id: (current?.id ?? 0) + 1,
                    message: `Orientação registrada para ${resume.full_name}.`,
                  }))
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ResumeCard({
  resume,
  onRecorded,
}: {
  resume: ResumeSummary;
  onRecorded: () => void;
}) {
  const titleId = `resume-${resume.id}-title`;
  const place = [resume.city, resume.state].filter(Boolean).join("/");

  return (
    <article
      aria-labelledby={titleId}
      className="flex flex-col gap-3 rounded-lg border-[1.5px] border-border bg-background p-[22px]"
    >
      <h2
        id={titleId}
        className="text-xl font-bold break-words text-foreground"
      >
        {resume.full_name}
      </h2>
      <p className="text-base break-words text-muted-foreground">
        {[resume.email, resume.phone, place].filter(Boolean).join(" · ")}
      </p>

      {resume.missing_fields.length === 0 ? (
        <p className="text-lg font-semibold text-success">Currículo completo</p>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-lg text-foreground">Falta preencher:</p>
          <ul
            aria-label={`O que falta no currículo de ${resume.full_name}`}
            className="flex flex-wrap gap-2"
          >
            {resume.missing_fields.map((field) => (
              <li
                key={field}
                className="rounded-full border border-border bg-accent px-3 py-1.5 text-base text-foreground"
              >
                {missingFieldLabel(field)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <LastGuidance guidance={resume.last_guidance} />
      <GuidanceDialog resume={resume} onRecorded={onRecorded} />
    </article>
  );
}

function LastGuidance({ guidance }: { guidance: Guidance | null }) {
  if (!guidance) {
    return (
      <p className="text-base text-muted-foreground">
        Nenhuma orientação registrada.
      </p>
    );
  }
  const date = new Date(guidance.created_at).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });
  return (
    <div className="flex flex-col gap-1 rounded-md bg-muted p-3">
      <p className="text-base text-muted-foreground">
        Última orientação em {date}, por {guidance.administrator_name}
      </p>
      <p className="text-lg break-words whitespace-pre-line text-foreground">
        {guidance.note}
      </p>
    </div>
  );
}

function GuidanceDialog({
  resume,
  onRecorded,
}: {
  resume: ResumeSummary;
  onRecorded: () => void;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const noteId = useId();
  const errorId = useId();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<GuidanceValues>({
    resolver: zodResolver(guidanceValuesSchema),
    defaultValues: { note: "" },
  });
  const mutation = useMutation({
    mutationFn: (values: GuidanceValues) => recordGuidance(resume.id, values),
    onSuccess: async () => {
      setOpen(false);
      reset();
      onRecorded();
      await queryClient.invalidateQueries({ queryKey: resumesQueryKey });
    },
  });
  const problem = errors.note?.message;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        // Closing mid-request would hide whether the note was saved.
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
            className="self-start"
            aria-label={`Registrar orientação para ${resume.full_name}`}
          >
            Registrar orientação
          </Button>
        }
      />
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Registrar orientação</DialogTitle>
          <DialogDescription>
            Conte o contato feito com {resume.full_name} e o que foi orientado.
            Seu nome e a data entram no registro automaticamente.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            void handleSubmit((values) => mutation.mutate(values))(event);
          }}
        >
          <div className="space-y-2">
            <Label htmlFor={noteId}>Orientação</Label>
            <Textarea
              {...register("note")}
              id={noteId}
              rows={5}
              maxLength={NOTE_MAX_LENGTH}
              aria-invalid={Boolean(problem)}
              aria-describedby={problem ? errorId : undefined}
            />
            {problem ? (
              <p id={errorId} role="alert" className="text-destructive">
                {problem}
              </p>
            ) : null}
          </div>
          {mutation.isError ? (
            <p role="alert" className="text-lg text-destructive">
              {guidanceErrorMessage(mutation.error)}
            </p>
          ) : null}
          <DialogFooter>
            <DialogClose
              disabled={mutation.isPending}
              render={
                <Button type="button" variant="outline">
                  Cancelar
                </Button>
              }
            />
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Salvando..." : "Salvar orientação"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
