import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { profileSaveErrorMessage } from "./professional-profile-errors";
import {
  professionalProfileQueryKey,
  updateAutomaticApplication,
} from "./professional-profile-update";

const SWITCH_ID = "accepts-automatic-application";
const HEADING_ID = "accepts-automatic-application-heading";
const DESCRIPTION_ID = "accepts-automatic-application-description";

// US-20-T05: the professional's choice is saved as soon as it changes, so it
// never waits for an unrelated "Salvar alterações".
export function AutomaticApplicationSection({ enabled }: { enabled: boolean }) {
  const queryClient = useQueryClient();
  const [announcement, setAnnouncement] = useState("");
  const mutation = useMutation({
    mutationFn: updateAutomaticApplication,
    onMutate: () => setAnnouncement(""),
    onSuccess: (profile) => {
      queryClient.setQueryData(professionalProfileQueryKey, profile);
      setAnnouncement(
        profile.accepts_automatic_application
          ? "Candidaturas automáticas ligadas."
          : "Candidaturas automáticas desligadas.",
      );
    },
  });
  // While saving, the switch shows the requested value; a failure puts the
  // saved value back because the cache was never changed.
  const checked = mutation.isPending ? mutation.variables : enabled;

  return (
    <div>
      <h3 id={HEADING_ID} className="mb-3 text-xl font-bold text-foreground">
        Candidaturas automáticas
      </h3>
      {/* The native checkbox keeps keyboard and form behavior; role="switch"
          makes screen readers announce it as on/off. */}
      <label
        htmlFor={SWITCH_ID}
        // relative: anchors the sr-only input here, so focusing it never
        // scrolls the page sideways.
        className="relative flex min-h-11 cursor-pointer items-center justify-between gap-4"
      >
        {/* The visible state means the switch never relies on color alone;
            it is hidden from screen readers, which already hear on/off. */}
        <span
          aria-hidden="true"
          className="text-lg font-semibold text-foreground"
        >
          {checked ? "Ligadas" : "Desligadas"}
        </span>
        <input
          id={SWITCH_ID}
          type="checkbox"
          role="switch"
          checked={checked}
          // aria-disabled instead of disabled: a disabled control drops focus
          // to the page body, which loses a keyboard user's place.
          aria-disabled={mutation.isPending}
          aria-labelledby={HEADING_ID}
          aria-describedby={DESCRIPTION_ID}
          onChange={(event) => {
            if (!mutation.isPending) mutation.mutate(event.target.checked);
          }}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className="relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border-2 border-foreground-2 bg-background transition-colors peer-checked:border-primary peer-checked:bg-primary peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50 motion-reduce:transition-none [&>span]:translate-x-1 peer-checked:[&>span]:translate-x-7 peer-checked:[&>span]:bg-primary-foreground"
        >
          <span className="size-5 rounded-full bg-foreground-2 transition-transform motion-reduce:transition-none" />
        </span>
      </label>
      <p id={DESCRIPTION_ID} className="mt-3 text-lg text-foreground-2">
        O sistema candidata você automaticamente às vagas com alta
        compatibilidade com o seu perfil. Você pode desligar a qualquer momento.
      </p>
      <p role="status" className="mt-2 text-base text-foreground-2">
        {mutation.isPending ? "Salvando…" : announcement}
      </p>
      {mutation.isError ? (
        <p role="alert" className="mt-2 text-base text-destructive">
          {profileSaveErrorMessage(mutation.error)}
        </p>
      ) : null}
    </div>
  );
}
