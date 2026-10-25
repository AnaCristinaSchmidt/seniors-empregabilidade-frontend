import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api-error";

import { startDownload } from "./certification-download";
import { profileSaveErrorMessage } from "./professional-profile-errors";
import {
  CERTIFICATE_ACCEPT,
  certificateFileProblem,
  certificationValuesSchema,
  createCertification,
  createEducation,
  createExperience,
  deleteCertificationById,
  deleteCertificationDocument,
  deleteEducationById,
  deleteExperienceById,
  educationValuesSchema,
  fetchCertificationDocumentUrl,
  experienceValuesSchema,
  professionalProfileQueryKey,
  saveSkillSelection,
  sameSkillSelection,
  updateCertificationById,
  updateEducationById,
  updateExperienceById,
  uploadCertificationDocument,
} from "./professional-profile";
import { CompanyBadge } from "@/components/ui/company-badge";
import { formatExperiencePeriod, getYear } from "./profile-date-utils";
import type {
  Certification,
  Education,
  Experience,
  ProfessionalProfile,
  Skill,
} from "./professional-profile-schema";
import {
  professionalProfileUpdateSchema,
  type ProfessionalProfileUpdateValues,
} from "./professional-profile-update-schema";
import { updateProfessionalProfile } from "./professional-profile-update";
import { SkillSelection } from "./skill-selection";
import { SectionHeading } from "./section-heading";

interface EditProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: ProfessionalProfile;
}

function defaultValuesFrom(
  profile: ProfessionalProfile,
): ProfessionalProfileUpdateValues {
  return {
    full_name: profile.full_name,
    phone: profile.phone,
    city: profile.city ?? "",
    state: profile.state ?? "",
    summary: profile.summary ?? "",
  };
}

export function EditProfileModal({
  open,
  onOpenChange,
  profile,
}: EditProfileModalProps) {
  // Mount a fresh draft on each opening, without resetting an active edit
  // when a background profile query updates.
  return open ? (
    <EditProfileEditor profile={profile} onOpenChange={onOpenChange} />
  ) : null;
}

function EditProfileEditor({
  profile,
  onOpenChange,
}: {
  profile: ProfessionalProfile;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<ProfessionalProfileUpdateValues>({
    resolver: zodResolver(professionalProfileUpdateSchema),
    defaultValues: defaultValuesFrom(profile),
  });

  const [experiences, setExperiences] = useState<Experience[]>(
    profile.experiences,
  );
  const [education, setEducation] = useState<Education[]>(profile.education);
  const [certifications, setCertifications] = useState<Certification[]>(
    profile.certifications,
  );
  const [skills, setSkills] = useState<Skill[]>(profile.skills);
  const [savedSkills, setSavedSkills] = useState<Skill[]>(profile.skills);
  const [skillsWereSaved, setSkillsWereSaved] = useState(false);
  const [failedStep, setFailedStep] = useState<"skills" | "profile" | null>(
    null,
  );
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const closeTimeoutRef = useRef<number | null>(null);
  const saveErrorRef = useRef<HTMLDivElement>(null);
  const keepEditingRef = useRef<HTMLButtonElement>(null);

  function closeEditor() {
    onOpenChange(false);
    // Collection edits and the skills PUT can already be persisted even if
    // the profile PATCH has not succeeded.
    void queryClient.invalidateQueries({
      queryKey: professionalProfileQueryKey,
    });
  }

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current !== null) {
        window.clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  const mutation = useMutation({
    mutationFn: async (values: ProfessionalProfileUpdateValues) => {
      if (!sameSkillSelection(savedSkills, skills)) {
        setFailedStep("skills");
        const stored = await saveSkillSelection(skills);
        setSavedSkills(stored);
        setSkillsWereSaved(true);
      }
      setFailedStep("profile");
      return updateProfessionalProfile(values);
    },
    onError: (error) => {
      // A missing skill must not require closing and losing the draft.
      if (error instanceof ApiError && error.code === "skill_not_found") {
        void queryClient.invalidateQueries({ queryKey: ["skills", "catalog"] });
      }
    },
    onSuccess: (updated) => {
      // The PATCH answers with the whole stored profile, including the
      // items already saved one by one, so it can replace the cache as is.
      queryClient.setQueryData(professionalProfileQueryKey, updated);

      setJustSaved(true);
      closeTimeoutRef.current = window.setTimeout(closeEditor, 900);
    },
  });

  useEffect(() => {
    if (mutation.isError) {
      saveErrorRef.current?.focus();
    }
  }, [mutation.isError, mutation.error]);

  function requestClose() {
    if (mutation.isPending || justSaved) return;
    if (isDirty || !sameSkillSelection(savedSkills, skills)) {
      setConfirmDiscard(true);
    } else {
      closeEditor();
    }
  }

  function onSubmit(values: ProfessionalProfileUpdateValues) {
    mutation.mutate(values);
  }

  return (
    <Dialog
      open
      onOpenChange={(nextOpen, details) => {
        if (!nextOpen) {
          details.cancel();
          requestClose();
        }
      }}
    >
      <DialogContent
        className="max-h-[90vh] max-w-3xl overflow-y-auto"
        showCloseButton={!mutation.isPending && !justSaved}
      >
        <DialogHeader>
          <DialogTitle className="text-2xl">Editar perfil</DialogTitle>
          <Separator />
        </DialogHeader>
        <form
          noValidate
          className="flex min-w-0 flex-col gap-6"
          onSubmit={(event) => {
            void handleSubmit(onSubmit)(event);
          }}
        >
          <fieldset
            aria-label="Dados do perfil"
            disabled={mutation.isPending || justSaved}
            className="flex min-w-0 flex-col gap-6"
          >
            <PhotoField />

            <Field>
              <FieldLabel htmlFor="full_name">Nome completo</FieldLabel>
              <Input
                id="full_name"
                aria-invalid={errors.full_name ? true : undefined}
                aria-describedby={
                  errors.full_name ? "full_name-error" : undefined
                }
                {...register("full_name")}
              />
              <FieldError id="full_name-error" errors={[errors.full_name]} />
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[116px_minmax(0,1fr)_170px]">
              <Field>
                <FieldLabel htmlFor="age">Idade</FieldLabel>
                <Input
                  id="age"
                  value={`${profile.age} anos`}
                  disabled
                  aria-label="Idade — calculada automaticamente, não é editável"
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="email">E-mail</FieldLabel>
                <Input id="email" value={profile.email} disabled />
              </Field>

              <Field>
                <FieldLabel htmlFor="phone">Telefone</FieldLabel>
                <Input
                  id="phone"
                  type="tel"
                  aria-invalid={errors.phone ? true : undefined}
                  aria-describedby={errors.phone ? "phone-error" : undefined}
                  {...register("phone")}
                />
                <FieldError id="phone-error" errors={[errors.phone]} />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_120px]">
              <Field>
                <FieldLabel htmlFor="city">Cidade</FieldLabel>
                <Input
                  id="city"
                  aria-invalid={errors.city ? true : undefined}
                  aria-describedby={errors.city ? "city-error" : undefined}
                  {...register("city")}
                />
                <FieldError id="city-error" errors={[errors.city]} />
              </Field>

              <Field>
                <FieldLabel htmlFor="state">Estado</FieldLabel>
                <Input
                  id="state"
                  maxLength={2}
                  className="uppercase"
                  aria-invalid={errors.state ? true : undefined}
                  aria-describedby={errors.state ? "state-error" : undefined}
                  {...register("state")}
                />
                <FieldError id="state-error" errors={[errors.state]} />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="summary">Resumo</FieldLabel>
              <Textarea
                id="summary"
                rows={4}
                aria-invalid={errors.summary ? true : undefined}
                aria-describedby={errors.summary ? "summary-error" : undefined}
                {...register("summary")}
              />
              <FieldError id="summary-error" errors={[errors.summary]} />
            </Field>

            <ExperienceFieldset
              experiences={experiences}
              onChange={setExperiences}
            />
            <EducationFieldset education={education} onChange={setEducation} />
            <CertificationFieldset
              certifications={certifications}
              onChange={setCertifications}
            />
            <SkillSelection
              selected={skills}
              onChange={setSkills}
              disabled={mutation.isPending || justSaved}
            />
          </fieldset>

          {justSaved ? (
            <p
              role="status"
              className="rounded-lg border border-success/30 bg-success/5 px-4 py-3 text-lg text-success"
            >
              Perfil atualizado com sucesso.
            </p>
          ) : null}
          {mutation.isError ? (
            <div
              ref={saveErrorRef}
              tabIndex={-1}
              role="alert"
              className="rounded-lg border border-destructive bg-background px-4 py-3 text-lg text-destructive outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <p>{profileSaveErrorMessage(mutation.error)}</p>
              {failedStep === "profile" && skillsWereSaved ? (
                <p className="mt-2">
                  As habilidades foram salvas. Não foi possível confirmar o
                  salvamento dos outros dados do perfil. Tente salvar novamente.
                </p>
              ) : null}
              {failedStep === "skills" ? (
                <p className="mt-2">
                  Sua seleção foi mantida para você revisar e tentar novamente.
                </p>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending || justSaved}
              onClick={requestClose}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending || justSaved}>
              {mutation.isPending ? "Salvando..." : "Salvar alterações"}
            </Button>
          </DialogFooter>
        </form>
        <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
          <AlertDialogContent initialFocus={keepEditingRef}>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Descartar as alterações não salvas?
              </AlertDialogTitle>
              <AlertDialogDescription>
                As alterações que ainda não foram salvas serão perdidas. O que
                já foi salvo será mantido.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel ref={keepEditingRef}>
                Continuar editando
              </AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={closeEditor}>
                Descartar alterações
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}

// The backend has no photo upload yet, so the control is shown but
// unavailable instead of pretending a chosen file was saved.
function PhotoField() {
  const descriptionId = useId();

  return (
    <Field>
      <FieldLabel>Foto de perfil</FieldLabel>
      <div className="flex flex-wrap items-center gap-4">
        <div
          aria-hidden
          className="flex h-18 w-18 shrink-0 items-center justify-center rounded-full border border-dashed border-input bg-accent/40 text-base text-foreground-2"
        >
          FOTO
        </div>
        <Button
          type="button"
          variant="outline"
          className="w-fit shrink-0"
          disabled
          aria-describedby={descriptionId}
        >
          Enviar foto
        </Button>
        <FieldDescription id={descriptionId}>
          O envio de foto ainda não está disponível.
        </FieldDescription>
      </div>
    </Field>
  );
}

// ---------- Experiência ----------

interface ExperienceDraft {
  role: string;
  company_name: string;
  start_date: string;
  end_date: string;
  description: string;
}

function draftFromExperience(exp?: Experience): ExperienceDraft {
  return {
    role: exp?.role ?? "",
    company_name: exp?.company_name ?? "",
    start_date: exp?.start_date ?? "",
    end_date: exp?.end_date ?? "",
    description: exp?.description ?? "",
  };
}

function draftToValues(draft: ExperienceDraft) {
  return {
    role: draft.role.trim(),
    company_name: draft.company_name.trim(),
    start_date: draft.start_date,
    end_date: draft.end_date || null,
    description: draft.description.trim() || null,
  };
}

function ExperienceFieldset({
  experiences,
  onChange,
}: {
  experiences: Experience[];
  onChange: (experiences: Experience[]) => void;
}) {
  // "new" é um id sentinela pro rascunho de um item ainda não criado no
  // servidor — só entra na lista `experiences` depois que o POST volta
  // com sucesso (com o id real).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ExperienceDraft>(draftFromExperience());
  const [itemError, setItemError] = useState<string | null>(null);

  const createMutation = useMutation({ mutationFn: createExperience });
  const updateMutation = useMutation({
    mutationFn: ({
      id,
      values,
    }: {
      id: string;
      values: ReturnType<typeof draftToValues>;
    }) => updateExperienceById(id, values),
  });
  const deleteMutation = useMutation({ mutationFn: deleteExperienceById });

  const isSaving = createMutation.isPending || updateMutation.isPending;

  function startAdd() {
    setDraft(draftFromExperience());
    setEditingId("new");
    setItemError(null);
  }

  function startEdit(exp: Experience) {
    setDraft(draftFromExperience(exp));
    setEditingId(exp.id);
    setItemError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setItemError(null);
  }

  async function saveEdit(id: string) {
    setItemError(null);
    const parsed = experienceValuesSchema.safeParse(draftToValues(draft));
    if (!parsed.success) {
      setItemError(parsed.error.issues[0]?.message ?? "Dados inválidos.");
      return;
    }
    const values = parsed.data;
    try {
      if (id === "new") {
        const created = await createMutation.mutateAsync(values);
        onChange([...experiences, created]);
      } else {
        const updated = await updateMutation.mutateAsync({ id, values });
        onChange(experiences.map((exp) => (exp.id === id ? updated : exp)));
      }
      setEditingId(null);
    } catch (error) {
      setItemError(profileSaveErrorMessage(error));
    }
  }

  async function remove(id: string) {
    setItemError(null);
    try {
      await deleteMutation.mutateAsync(id);
      onChange(experiences.filter((exp) => exp.id !== id));
      if (editingId === id) {
        setEditingId(null);
      }
    } catch (error) {
      setItemError(profileSaveErrorMessage(error));
    }
  }

  function renderEditForm(id: string) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-ring p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={`exp-role-${id}`}>Cargo</FieldLabel>
            <Input
              id={`exp-role-${id}`}
              value={draft.role}
              onChange={(event) =>
                setDraft({ ...draft, role: event.target.value })
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`exp-company-${id}`}>Empresa</FieldLabel>
            <Input
              id={`exp-company-${id}`}
              value={draft.company_name}
              onChange={(event) =>
                setDraft({ ...draft, company_name: event.target.value })
              }
            />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={`exp-start-${id}`}>Início</FieldLabel>
            <Input
              id={`exp-start-${id}`}
              type="date"
              value={draft.start_date}
              onChange={(event) =>
                setDraft({ ...draft, start_date: event.target.value })
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`exp-end-${id}`}>
              Fim (deixe em branco se atual)
            </FieldLabel>
            <Input
              id={`exp-end-${id}`}
              type="date"
              value={draft.end_date}
              onChange={(event) =>
                setDraft({ ...draft, end_date: event.target.value })
              }
            />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor={`exp-desc-${id}`}>Descrição</FieldLabel>
          <Textarea
            id={`exp-desc-${id}`}
            rows={3}
            value={draft.description}
            onChange={(event) =>
              setDraft({ ...draft, description: event.target.value })
            }
          />
        </Field>
        {itemError ? (
          <p role="alert" className="text-base text-destructive">
            {itemError}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={isSaving}
            onClick={cancelEdit}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={isSaving}
            onClick={() => void saveEdit(id)}
          >
            {isSaving ? "Salvando..." : "Concluir"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <SectionHeading>Experiência</SectionHeading>
        <Button
          type="button"
          variant="outline"
          onClick={startAdd}
          disabled={editingId !== null}
        >
          Adicionar experiência
        </Button>
      </div>
      {experiences.length === 0 && editingId !== "new" ? (
        <p className="text-lg text-muted-foreground">
          Nenhuma experiência cadastrada ainda.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {experiences.map((exp) => {
            const period = formatExperiencePeriod(exp.start_date, exp.end_date);
            return editingId === exp.id ? (
              <div key={exp.id}>{renderEditForm(exp.id)}</div>
            ) : (
              <div
                key={exp.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border p-4"
              >
                <div className="flex items-center gap-3">
                  <CompanyBadge companyName={exp.company_name} />
                  <div>
                    <p className="text-lg font-bold text-foreground">
                      {exp.role} · {exp.company_name}
                    </p>
                    <p className="text-base text-muted-foreground">
                      {period.label} · {period.duration}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={editingId !== null || deleteMutation.isPending}
                    onClick={() => startEdit(exp)}
                  >
                    Editar
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={editingId !== null || deleteMutation.isPending}
                    onClick={() => void remove(exp.id)}
                  >
                    Remover
                  </Button>
                </div>
              </div>
            );
          })}
          {editingId === "new" ? renderEditForm("new") : null}
        </div>
      )}
    </div>
  );
}

// ---------- Formação ----------

interface EducationDraft {
  institution: string;
  degree: string;
  field: string;
  start_date: string;
  end_date: string;
}

function draftFromEducation(item?: Education): EducationDraft {
  return {
    institution: item?.institution ?? "",
    degree: item?.degree ?? "",
    field: item?.field ?? "",
    start_date: item?.start_date ?? "",
    end_date: item?.end_date ?? "",
  };
}

function educationDraftToValues(draft: EducationDraft) {
  return {
    institution: draft.institution.trim(),
    degree: draft.degree.trim() || null,
    field: draft.field.trim() || null,
    start_date: draft.start_date || null,
    end_date: draft.end_date || null,
  };
}

function EducationFieldset({
  education,
  onChange,
}: {
  education: Education[];
  onChange: (education: Education[]) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EducationDraft>(draftFromEducation());
  const [itemError, setItemError] = useState<string | null>(null);

  const createMutation = useMutation({ mutationFn: createEducation });
  const updateMutation = useMutation({
    mutationFn: ({
      id,
      values,
    }: {
      id: string;
      values: ReturnType<typeof educationDraftToValues>;
    }) => updateEducationById(id, values),
  });
  const deleteMutation = useMutation({ mutationFn: deleteEducationById });

  const isSaving = createMutation.isPending || updateMutation.isPending;

  function startAdd() {
    setDraft(draftFromEducation());
    setEditingId("new");
    setItemError(null);
  }

  function startEdit(item: Education) {
    setDraft(draftFromEducation(item));
    setEditingId(item.id);
    setItemError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setItemError(null);
  }

  async function saveEdit(id: string) {
    setItemError(null);
    const parsed = educationValuesSchema.safeParse(
      educationDraftToValues(draft),
    );
    if (!parsed.success) {
      setItemError(parsed.error.issues[0]?.message ?? "Dados inválidos.");
      return;
    }
    const values = parsed.data;
    try {
      if (id === "new") {
        const created = await createMutation.mutateAsync(values);
        onChange([...education, created]);
      } else {
        const updated = await updateMutation.mutateAsync({ id, values });
        onChange(education.map((item) => (item.id === id ? updated : item)));
      }
      setEditingId(null);
    } catch (error) {
      setItemError(profileSaveErrorMessage(error));
    }
  }

  async function remove(id: string) {
    setItemError(null);
    try {
      await deleteMutation.mutateAsync(id);
      onChange(education.filter((item) => item.id !== id));
      if (editingId === id) {
        setEditingId(null);
      }
    } catch (error) {
      setItemError(profileSaveErrorMessage(error));
    }
  }

  function renderEditForm(id: string) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-ring p-4">
        <Field>
          <FieldLabel htmlFor={`edu-institution-${id}`}>Instituição</FieldLabel>
          <Input
            id={`edu-institution-${id}`}
            value={draft.institution}
            onChange={(event) =>
              setDraft({ ...draft, institution: event.target.value })
            }
          />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={`edu-degree-${id}`}>
              Curso/grau (ex: MBA)
            </FieldLabel>
            <Input
              id={`edu-degree-${id}`}
              value={draft.degree}
              onChange={(event) =>
                setDraft({ ...draft, degree: event.target.value })
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`edu-field-${id}`}>Área</FieldLabel>
            <Input
              id={`edu-field-${id}`}
              value={draft.field}
              onChange={(event) =>
                setDraft({ ...draft, field: event.target.value })
              }
            />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={`edu-start-${id}`}>Início</FieldLabel>
            <Input
              id={`edu-start-${id}`}
              type="date"
              value={draft.start_date}
              onChange={(event) =>
                setDraft({ ...draft, start_date: event.target.value })
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`edu-end-${id}`}>Conclusão</FieldLabel>
            <Input
              id={`edu-end-${id}`}
              type="date"
              value={draft.end_date}
              onChange={(event) =>
                setDraft({ ...draft, end_date: event.target.value })
              }
            />
          </Field>
        </div>
        {itemError ? (
          <p role="alert" className="text-base text-destructive">
            {itemError}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={isSaving}
            onClick={cancelEdit}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={isSaving}
            onClick={() => void saveEdit(id)}
          >
            {isSaving ? "Salvando..." : "Concluir"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <SectionHeading>Formação</SectionHeading>
        <Button
          type="button"
          variant="outline"
          onClick={startAdd}
          disabled={editingId !== null}
        >
          Adicionar formação
        </Button>
      </div>
      {education.length === 0 && editingId !== "new" ? (
        <p className="text-lg text-muted-foreground">
          Nenhuma formação cadastrada ainda.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {education.map((item) => {
            const title = [item.degree, item.field]
              .filter(Boolean)
              .join(" em ");
            const dateForYear = item.end_date ?? item.start_date;
            const year = dateForYear ? getYear(dateForYear) : null;
            return editingId === item.id ? (
              <div key={item.id}>{renderEditForm(item.id)}</div>
            ) : (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border p-4"
              >
                <div>
                  <p className="text-lg font-bold text-foreground">
                    {title || item.institution}
                  </p>
                  <p className="text-base text-muted-foreground">
                    {title ? item.institution : null}
                    {title && year ? " · " : null}
                    {year}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={editingId !== null || deleteMutation.isPending}
                    onClick={() => startEdit(item)}
                  >
                    Editar
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={editingId !== null || deleteMutation.isPending}
                    onClick={() => void remove(item.id)}
                  >
                    Remover
                  </Button>
                </div>
              </div>
            );
          })}
          {editingId === "new" ? renderEditForm("new") : null}
        </div>
      )}
    </div>
  );
}

// ---------- Certificações ----------

interface CertificationDraft {
  name: string;
  issuer: string;
  issued_date: string;
  expiration_date: string;
}

function draftFromCertification(item?: Certification): CertificationDraft {
  return {
    name: item?.name ?? "",
    issuer: item?.issuer ?? "",
    issued_date: item?.issued_date ?? "",
    expiration_date: item?.expiration_date ?? "",
  };
}

function certificationDraftToValues(draft: CertificationDraft) {
  return {
    name: draft.name.trim(),
    issuer: draft.issuer.trim() || null,
    issued_date: draft.issued_date || null,
    expiration_date: draft.expiration_date || null,
  };
}

function formatDocumentSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

function CertificationFieldset({
  certifications,
  onChange,
}: {
  certifications: Certification[];
  onChange: (certifications: Certification[]) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CertificationDraft>(
    draftFromCertification(),
  );
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [itemError, setItemError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const createMutation = useMutation({ mutationFn: createCertification });
  const updateMutation = useMutation({
    mutationFn: ({
      id,
      values,
    }: {
      id: string;
      values: ReturnType<typeof certificationDraftToValues>;
    }) => updateCertificationById(id, values),
  });
  const uploadMutation = useMutation({
    mutationFn: ({ id, document }: { id: string; document: File }) =>
      uploadCertificationDocument(id, document, setUploadProgress),
    onSettled: () => setUploadProgress(null),
  });
  const removeDocumentMutation = useMutation({
    mutationFn: deleteCertificationDocument,
  });
  const deleteMutation = useMutation({ mutationFn: deleteCertificationById });
  const downloadMutation = useMutation({
    mutationFn: fetchCertificationDocumentUrl,
    onSuccess: (url) => startDownload(url),
  });

  const isSaving =
    createMutation.isPending ||
    updateMutation.isPending ||
    uploadMutation.isPending ||
    removeDocumentMutation.isPending;
  const isBusy = isSaving || deleteMutation.isPending;

  function openForm(item?: Certification) {
    setDraft(draftFromCertification(item));
    setFile(null);
    setEditingId(item?.id ?? "new");
    setItemError(null);
    setListError(null);
  }

  function replace(list: Certification[], saved: Certification) {
    return list.some((item) => item.id === saved.id)
      ? list.map((item) => (item.id === saved.id ? saved : item))
      : [...list, saved];
  }

  async function saveEdit(id: string) {
    setItemError(null);
    const parsed = certificationValuesSchema.safeParse(
      certificationDraftToValues(draft),
    );
    if (!parsed.success) {
      setItemError(parsed.error.issues[0]?.message ?? "Dados inválidos.");
      return;
    }
    const fileProblem = file ? certificateFileProblem(file) : null;
    if (fileProblem) {
      setItemError(fileProblem);
      return;
    }
    let list = certifications;
    try {
      let saved =
        id === "new"
          ? await createMutation.mutateAsync(parsed.data)
          : await updateMutation.mutateAsync({ id, values: parsed.data });
      list = replace(list, saved);
      onChange(list);
      // From here on a retry edits the saved item instead of creating another.
      setEditingId(saved.id);
      if (file) {
        saved = await uploadMutation.mutateAsync({
          id: saved.id,
          document: file,
        });
        onChange(replace(list, saved));
      }
      setFile(null);
      setEditingId(null);
    } catch (error) {
      setItemError(profileSaveErrorMessage(error));
    }
  }

  async function removeDocument(item: Certification) {
    setItemError(null);
    try {
      await removeDocumentMutation.mutateAsync(item.id);
      onChange(replace(certifications, { ...item, document: null }));
    } catch (error) {
      setItemError(profileSaveErrorMessage(error));
    }
  }

  async function remove(id: string) {
    setListError(null);
    try {
      await deleteMutation.mutateAsync(id);
      onChange(certifications.filter((item) => item.id !== id));
    } catch (error) {
      setListError(profileSaveErrorMessage(error));
    }
  }

  function download(id: string) {
    setListError(null);
    downloadMutation.mutate(id, {
      onError: (error) => setListError(profileSaveErrorMessage(error)),
    });
  }

  function renderEditForm(id: string) {
    const current = certifications.find((item) => item.id === id);
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-ring p-4">
        <Field>
          <FieldLabel htmlFor={`cert-name-${id}`}>
            Nome da certificação
          </FieldLabel>
          <Input
            id={`cert-name-${id}`}
            value={draft.name}
            onChange={(event) =>
              setDraft({ ...draft, name: event.target.value })
            }
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`cert-issuer-${id}`}>
            Instituição emissora
          </FieldLabel>
          <Input
            id={`cert-issuer-${id}`}
            value={draft.issuer}
            onChange={(event) =>
              setDraft({ ...draft, issuer: event.target.value })
            }
          />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={`cert-issued-${id}`}>
              Data de emissão
            </FieldLabel>
            <Input
              id={`cert-issued-${id}`}
              type="date"
              value={draft.issued_date}
              onChange={(event) =>
                setDraft({ ...draft, issued_date: event.target.value })
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`cert-expiration-${id}`}>
              Validade (deixe em branco se não expira)
            </FieldLabel>
            <Input
              id={`cert-expiration-${id}`}
              type="date"
              value={draft.expiration_date}
              onChange={(event) =>
                setDraft({ ...draft, expiration_date: event.target.value })
              }
            />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor={`cert-file-${id}`}>
            {current?.document ? "Trocar comprovante" : "Comprovante"}
          </FieldLabel>
          <Input
            id={`cert-file-${id}`}
            type="file"
            accept={CERTIFICATE_ACCEPT}
            aria-describedby={`cert-file-hint-${id}`}
            className="py-2.5"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setItemError(null);
            }}
          />
          <FieldDescription id={`cert-file-hint-${id}`}>
            PDF, PNG ou JPG, até 5 MB. Opcional.
          </FieldDescription>
        </Field>
        {current?.document ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted px-4 py-3">
            <p className="text-base text-foreground">
              Arquivo atual: {current.document.filename}
            </p>
            <Button
              type="button"
              variant="outline"
              disabled={isSaving}
              onClick={() => void removeDocument(current)}
            >
              Remover comprovante
            </Button>
          </div>
        ) : null}
        {uploadProgress !== null ? (
          <Progress value={uploadProgress} aria-label="Envio do comprovante">
            <p role="status" className="text-base text-foreground">
              Enviando comprovante... {uploadProgress}%
            </p>
          </Progress>
        ) : null}
        {itemError ? (
          <p role="alert" className="text-base text-destructive">
            {itemError}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={isSaving}
            onClick={() => setEditingId(null)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={isSaving}
            onClick={() => void saveEdit(id)}
          >
            {isSaving ? "Salvando..." : "Concluir"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <SectionHeading>Certificações</SectionHeading>
        <Button
          type="button"
          variant="outline"
          onClick={() => openForm()}
          disabled={editingId !== null}
        >
          Adicionar certificação
        </Button>
      </div>
      {listError ? (
        <p role="alert" className="mb-3 text-base text-destructive">
          {listError}
        </p>
      ) : null}
      {certifications.length === 0 && editingId !== "new" ? (
        <p className="text-lg text-muted-foreground">
          Nenhuma certificação cadastrada ainda.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {certifications.map((item) =>
            editingId === item.id ? (
              <div key={item.id}>{renderEditForm(item.id)}</div>
            ) : (
              <div
                key={item.id}
                className="flex flex-col gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-lg font-bold text-foreground">
                    {item.name}
                  </p>
                  <p className="text-base text-muted-foreground">
                    {[
                      item.issuer,
                      item.issued_date ? getYear(item.issued_date) : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <p className="text-base text-muted-foreground">
                    {item.document
                      ? `Comprovante: ${item.document.filename} (${formatDocumentSize(item.document.size_bytes)})`
                      : "Sem comprovante"}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {item.document ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={downloadMutation.isPending}
                      aria-label={`Baixar comprovante de ${item.name}`}
                      onClick={() => download(item.id)}
                    >
                      Baixar
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    disabled={editingId !== null || isBusy}
                    aria-label={`Editar certificação ${item.name}`}
                    onClick={() => openForm(item)}
                  >
                    Editar
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={editingId !== null || isBusy}
                    aria-label={`Remover certificação ${item.name}`}
                    onClick={() => void remove(item.id)}
                  >
                    Remover
                  </Button>
                </div>
              </div>
            ),
          )}
          {editingId === "new" ? renderEditForm("new") : null}
        </div>
      )}
    </div>
  );
}
