import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";

import { Button } from "@/components/ui/button";
import { CompanyBadge } from "@/components/ui/company-badge";

import {
  canRetryCompanyProfile,
  companyProfileErrorMessage,
  companyProfileQueryOptions,
  type CompanyAddress,
  type CompanyProfile,
} from "./company-profile";
import { CompanyProfileEditModal } from "./company-profile-edit-modal";
import { maskCnpj, maskZipCode } from "./registration-schema";

export function CompanyProfilePage() {
  const [notice, setNotice] = useState<{ id: number; message: string } | null>(
    null,
  );
  const profile = useQuery(companyProfileQueryOptions);

  // A new id renders the notice again, so a second save is announced again.
  function announce(message: string) {
    setNotice((current) => ({ id: (current?.id ?? 0) + 1, message }));
  }

  return (
    <div className="min-h-full bg-muted p-4 md:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold text-foreground">
          Perfil da empresa
        </h1>
        {profile.data ? (
          <CompanyProfileEditModal
            profile={profile.data}
            onSaved={() =>
              announce("Perfil atualizado. As alterações já aparecem abaixo.")
            }
          />
        ) : null}
      </div>

      {/* Rendered empty from the start so the confirmation is announced. */}
      <div role="status">
        {notice ? (
          <div
            key={notice.id}
            className="mb-6 flex flex-col gap-1 rounded-lg border border-success bg-background p-4"
          >
            <span className="font-mono text-base font-semibold tracking-wide text-success uppercase">
              Sucesso
            </span>
            <p className="text-lg text-foreground">{notice.message}</p>
          </div>
        ) : null}
      </div>

      {profile.isPending ? (
        <ProfileSkeleton />
      ) : profile.isError && profile.data === undefined ? (
        // A failed background refetch keeps the last loaded profile on
        // screen; the error state is only for a profile that never loaded.
        <ProfileError
          message={companyProfileErrorMessage(profile.error)}
          onRetry={
            canRetryCompanyProfile(profile.error)
              ? () => void profile.refetch()
              : undefined
          }
        />
      ) : (
        <ProfileContent profile={profile.data} />
      )}
    </div>
  );
}

function ProfileContent({ profile }: { profile: CompanyProfile }) {
  const name = profile.display_name ?? profile.legal_name;

  return (
    <div className="flex flex-col gap-6">
      <section
        aria-labelledby="company-profile-name"
        className="flex items-center gap-4 rounded-lg border-[1.5px] border-border bg-background p-6"
      >
        <CompanyBadge companyName={name} />
        <div className="flex min-w-0 flex-col gap-1">
          <h2
            id="company-profile-name"
            className="text-[26px] font-bold break-words text-foreground"
          >
            {name}
          </h2>
          {profile.industry ? (
            <p className="text-lg text-muted-foreground">{profile.industry}</p>
          ) : null}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <ProfileSection id="company-profile-details" title="Dados da empresa">
          <DetailList
            rows={[
              ["Nome da empresa", profile.display_name, "Não informado"],
              ["Razão social", profile.legal_name, "Não informada"],
              ["CNPJ", maskCnpj(profile.cnpj), "Não informado"],
              ["Área de atuação", profile.industry, "Não informada"],
            ]}
          />
        </ProfileSection>

        <ProfileSection id="company-profile-address" title="Endereço">
          {profile.address ? (
            <AddressDetails address={profile.address} />
          ) : (
            <p className="text-lg text-muted-foreground">
              Nenhum endereço cadastrado ainda.
            </p>
          )}
        </ProfileSection>

        <ProfileSection id="company-profile-contact" title="Contato">
          <DetailList
            rows={[
              ["E-mail de contato", profile.contact_email, "Não informado"],
              ["Telefone", profile.contact_phone, "Não informado"],
            ]}
          />
        </ProfileSection>
      </div>
    </div>
  );
}

function ProfileSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="rounded-lg border-[1.5px] border-border bg-background p-6"
    >
      <h3 id={id} className="mb-4 text-xl font-bold text-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

/** Label, value, and the text shown when the optional value is missing. */
type DetailRow = [label: string, value: string | null, missing: string];

function DetailList({ rows }: { rows: DetailRow[] }) {
  return (
    <dl className="flex flex-col gap-4">
      {rows.map(([label, value, missing]) => (
        <div key={label} className="flex flex-col gap-1">
          <dt className="text-base font-semibold text-muted-foreground">
            {label}
          </dt>
          {value ? (
            <dd className="text-lg break-words text-foreground">{value}</dd>
          ) : (
            <dd className="text-lg text-muted-foreground">{missing}</dd>
          )}
        </div>
      ))}
    </dl>
  );
}

function AddressDetails({ address }: { address: CompanyAddress }) {
  const street = [address.street, address.number, address.complement]
    .filter(Boolean)
    .join(", ");

  return (
    <DetailList
      rows={[
        ["Logradouro", street, "Não informado"],
        ["Bairro", address.neighborhood, "Não informado"],
        ["Cidade", `${address.city} – ${address.state}`, "Não informada"],
        ["CEP", maskZipCode(address.zip_code), "Não informado"],
      ]}
    />
  );
}

function ProfileSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <p className="sr-only">Carregando o perfil da empresa…</p>
      <div className="h-28 animate-pulse rounded-lg bg-accent motion-reduce:animate-none" />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-64 animate-pulse rounded-lg bg-accent motion-reduce:animate-none" />
        <div className="h-64 animate-pulse rounded-lg bg-accent motion-reduce:animate-none" />
      </div>
    </div>
  );
}

function ProfileError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: (() => void) | undefined;
}) {
  return (
    <div
      role="alert"
      className="flex max-w-xl flex-col items-start gap-4 rounded-lg border-[1.5px] border-destructive bg-background p-6"
    >
      <span className="font-mono text-base font-semibold tracking-wide text-destructive uppercase">
        Erro
      </span>
      <p className="text-lg text-foreground">{message}</p>
      {onRetry ? (
        <Button type="button" variant="outline" onClick={onRetry}>
          Tentar novamente
        </Button>
      ) : null}
    </div>
  );
}
