import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
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

import { startDownload } from "./certification-download";
import { profileSaveErrorMessage } from "./professional-profile-errors";
import {
  addProfileSkill,
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
  removeProfileSkill,
  searchSkillCatalog,
  skillCatalogQueryKey,
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
  const queryClient = useQueryClient();

  // Experiences, education and skills are saved one item at a time, before
  // (or even without) "Salvar alterações". Refetching whenever the modal
  // closes, including "Cancelar" and Esc, keeps "Meu perfil" in step with
  // what the server actually stored.
  function handleOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      void queryClient.invalidateQueries({
        queryKey: professionalProfileQueryKey,
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">Editar perfil</DialogTitle>
          <Separator />
        </DialogHeader>

        {/* Só renderiza (e monta) o formulário quando o modal está
            aberto. Isso faz o React criar uma instância nova — com todo
            o estado local (react-hook-form, experiências, etc.) fresco —
            toda vez que ele abre, sem precisar de um efeito pra "resetar"
            nada (o que o ESLint não deixa fazer chamando setState direto
            dentro de um effect) e sem precisar mexer em quem usa esse
            componente (o ProfileView não muda nada). */}
        {open ? (
          <EditProfileForm profile={profile} onOpenChange={handleOpenChange} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function EditProfileForm({
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
    formState: { errors },
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
  const [justSaved, setJustSaved] = useState(false);
  const closeTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current !== null) {
        window.clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  const mutation = useMutation({
    mutationFn: updateProfessionalProfile,
    onSuccess: (updated) => {
      // The PATCH answers with the whole stored profile, including the
      // items already saved one by one, so it can replace the cache as is.
      queryClient.setQueryData(professionalProfileQueryKey, updated);

      setJustSaved(true);
      closeTimeoutRef.current = window.setTimeout(
        () => onOpenChange(false),
        900,
      );
    },
  });

  function onSubmit(values: ProfessionalProfileUpdateValues) {
    mutation.mutate(values);
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        void handleSubmit(onSubmit)(event);
      }}
    >
      {justSaved ? (
        <p
          role="status"
          className="rounded-lg border border-success/30 bg-success/5 px-4 py-3 text-lg text-success"
        >
          Perfil atualizado com sucesso.
        </p>
      ) : null}
      {mutation.isError ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-lg text-destructive"
        >
          {profileSaveErrorMessage(mutation.error)}
        </p>
      ) : null}

      <PhotoField />

      <Field>
        <FieldLabel htmlFor="full_name">Nome completo</FieldLabel>
        <Input
          id="full_name"
          aria-invalid={errors.full_name ? true : undefined}
          aria-describedby={errors.full_name ? "full_name-error" : undefined}
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

      <ExperienceFieldset experiences={experiences} onChange={setExperiences} />
      <EducationFieldset education={education} onChange={setEducation} />
      <CertificationFieldset
        certifications={certifications}
        onChange={setCertifications}
      />
      <SkillsFieldset skills={skills} onChange={setSkills} />

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          disabled={mutation.isPending || justSaved}
          onClick={() => onOpenChange(false)}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={mutation.isPending || justSaved}>
          {mutation.isPending ? "Salvando..." : "Salvar alterações"}
        </Button>
      </DialogFooter>
    </form>
  );
}

// The backend has no photo upload yet, so the control is shown but
// unavailable instead of pretending a chosen file was saved.
function PhotoField() {
  const descriptionId = useId();

  return (
    <Field>
      <FieldLabel>Foto de perfil</FieldLabel>
      <div className="flex items-center gap-4">
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

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xl font-bold text-foreground">{children}</h3>;
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
      <div className="mb-3 flex items-center justify-between gap-3">
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
      <div className="mb-3 flex items-center justify-between gap-3">
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
      <div className="mb-3 flex items-center justify-between gap-3">
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

// ---------- Habilidades ----------

const SKILL_SEARCH_DELAY_MS = 250;

// Case- and accent-insensitive, like the catalog search on the backend.
function comparableSkillName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

function SkillsFieldset({
  skills,
  onChange,
}: {
  skills: Skill[];
  onChange: (skills: Skill[]) => void;
}) {
  const [draftName, setDraftName] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [itemError, setItemError] = useState<string | null>(null);
  const inputId = useId();
  const hintId = useId();

  // Waits for a pause in typing so each keystroke does not become a request.
  useEffect(() => {
    const timeoutId = window.setTimeout(
      () => setSearchTerm(draftName.trim()),
      SKILL_SEARCH_DELAY_MS,
    );
    return () => window.clearTimeout(timeoutId);
  }, [draftName]);

  const catalog = useQuery({
    queryKey: skillCatalogQueryKey(searchTerm),
    queryFn: ({ signal }) => searchSkillCatalog(searchTerm, signal),
    enabled: searchTerm.length > 0,
    retry: false,
  });

  const addMutation = useMutation({ mutationFn: addProfileSkill });
  const removeMutation = useMutation({ mutationFn: removeProfileSkill });
  const isBusy = addMutation.isPending || removeMutation.isPending;

  const linkedIds = new Set(skills.map((skill) => skill.id));
  const suggestions =
    searchTerm.length > 0 && catalog.data
      ? catalog.data.filter((skill) => !linkedIds.has(skill.id))
      : [];

  async function addSkill(skill: Skill) {
    setItemError(null);
    try {
      const added = await addMutation.mutateAsync(skill.id);
      onChange([...skills, added]);
      setDraftName("");
      setSearchTerm("");
    } catch (error) {
      setItemError(profileSaveErrorMessage(error));
    }
  }

  async function removeSkill(skill: Skill) {
    setItemError(null);
    try {
      await removeMutation.mutateAsync(skill.id);
      onChange(skills.filter((item) => item.id !== skill.id));
    } catch (error) {
      setItemError(profileSaveErrorMessage(error));
    }
  }

  // Enter adds the suggestion whose name matches what was typed, or the only
  // suggestion left; otherwise the person picks one from the list.
  function addTypedSkill() {
    const typed = comparableSkillName(draftName);
    if (!typed) {
      return;
    }
    const alreadyLinked = skills.some(
      (skill) => comparableSkillName(skill.name) === typed,
    );
    if (alreadyLinked) {
      setItemError("Esta habilidade já está no seu perfil.");
      return;
    }
    const exactMatch = suggestions.find(
      (skill) => comparableSkillName(skill.name) === typed,
    );
    const choice =
      exactMatch ?? (suggestions.length === 1 ? suggestions[0] : undefined);
    if (choice) {
      void addSkill(choice);
    }
  }

  function suggestionsStatus(): string | null {
    if (searchTerm.length === 0) {
      return null;
    }
    if (catalog.isFetching) {
      return "Buscando habilidades...";
    }
    if (catalog.isError) {
      return "Não foi possível buscar as habilidades. Tente novamente.";
    }
    if (suggestions.length === 0) {
      return "Nenhuma habilidade encontrada no catálogo.";
    }
    return null;
  }

  const status = suggestionsStatus();

  return (
    <div>
      <SectionHeading>Habilidades</SectionHeading>
      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-input p-3">
        {skills.map((skill) => (
          <span
            key={skill.id}
            className="flex items-center gap-1.5 rounded-full border border-border bg-accent px-3 py-1.5 text-base text-foreground"
          >
            {skill.name}
            <button
              type="button"
              disabled={isBusy}
              onClick={() => void removeSkill(skill)}
              aria-label={`Remover habilidade ${skill.name}`}
              className="rounded-full text-foreground-2 hover:text-destructive focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:text-disabled-foreground"
            >
              ×
            </button>
          </span>
        ))}
        <label htmlFor={inputId} className="sr-only">
          Adicionar habilidade
        </label>
        <Input
          id={inputId}
          value={draftName}
          disabled={addMutation.isPending}
          onChange={(event) => {
            setDraftName(event.target.value);
            setItemError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addTypedSkill();
            }
          }}
          placeholder="Busque uma habilidade"
          aria-describedby={hintId}
          className="h-9 w-56 border-none px-2 shadow-none focus-visible:ring-0"
        />
      </div>
      {suggestions.length > 0 ? (
        <ul
          aria-label="Sugestões de habilidades"
          className="mt-2 flex flex-wrap gap-2"
        >
          {suggestions.map((skill) => (
            <li key={skill.id}>
              <Button
                type="button"
                variant="outline"
                disabled={isBusy}
                onClick={() => void addSkill(skill)}
              >
                {skill.name}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {status ? (
        <p role="status" className="mt-2 text-base text-muted-foreground">
          {status}
        </p>
      ) : null}
      {itemError ? (
        <p role="alert" className="mt-2 text-base text-destructive">
          {itemError}
        </p>
      ) : null}
      <p id={hintId} className="mt-2 text-base text-muted-foreground">
        Escolha as habilidades do catálogo. São elas que a vaga compara para
        dizer quantos requisitos você atende.
      </p>
    </div>
  );
}
