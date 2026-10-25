import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "@/lib/api-client";
import { ApiError } from "@/lib/api-error";

import { EditProfileModal } from "./edit-profile-modal";
import type { ProfessionalProfile } from "./professional-profile-schema";

vi.mock("@/lib/api-client", () => ({
  apiClient: { get: vi.fn(), put: vi.fn(), patch: vi.fn() },
}));

const leadership = { id: "s1", name: "Liderança", type: "soft" as const };
const excel = { id: "s2", name: "Excel", type: "hard" as const };
const profile: ProfessionalProfile = {
  id: "candidate-synthetic",
  full_name: "Pessoa Sintética",
  age: 58,
  email: "candidate@example.invalid",
  phone: "11999990000",
  city: "Porto Alegre",
  state: "RS",
  summary: "Perfil sintético",
  skills: [leadership],
  experiences: [],
  education: [],
  certifications: [],
};

function Harness({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState(true);
  return (
    <EditProfileModal
      open={open}
      profile={profile}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) onClose();
      }}
    />
  );
}

function openEditor() {
  const onClose = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  render(
    <QueryClientProvider client={client}>
      <Harness onClose={onClose} />
    </QueryClientProvider>,
  );
  return { onClose, invalidate };
}

async function selectExcel(user: ReturnType<typeof userEvent.setup>) {
  const catalog = await screen.findByRole("list", {
    name: "Catálogo de habilidades",
  });
  await user.click(within(catalog).getByRole("button", { name: "Excel" }));
}

beforeEach(() => {
  vi.spyOn(apiClient, "get").mockResolvedValue({ data: [leadership, excel] });
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("profile review feedback", () => {
  it.each(["cancel", "escape", "close", "outside"] as const)(
    "confirms a dirty selection on %s and can keep editing",
    async (method) => {
      const user = userEvent.setup();
      const put = vi.spyOn(apiClient, "put");
      const { onClose } = openEditor();
      await selectExcel(user);
      if (method === "cancel")
        await user.click(screen.getByRole("button", { name: "Cancelar" }));
      if (method === "escape") await user.keyboard("{Escape}");
      if (method === "close")
        await user.click(screen.getByRole("button", { name: "Fechar" }));
      if (method === "outside") {
        const backdrop = document.querySelector<HTMLElement>(
          '[data-slot="dialog-backdrop"]',
        );
        expect(backdrop).not.toBeNull();
        await user.click(backdrop!);
      }
      const confirmation = await screen.findByRole("alertdialog");
      const keepEditing = within(confirmation).getByRole("button", {
        name: "Continuar editando",
      });
      await waitFor(() => expect(keepEditing).toHaveFocus());
      expect(onClose).not.toHaveBeenCalled();
      await user.click(keepEditing);
      await waitFor(() =>
        expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
      );
      expect(
        screen.getByRole("button", { name: "Remover habilidade Excel" }),
      ).toBeVisible();
      expect(put).not.toHaveBeenCalled();
    },
  );

  it("clears nonempty search on Escape before offering to discard", async () => {
    const user = userEvent.setup();
    const { onClose } = openEditor();
    await selectExcel(user);
    const search = screen.getByLabelText("Buscar no catálogo");
    await user.type(search, "excel");
    await user.keyboard("{Escape}");
    expect(search).toHaveValue("");
    expect(search).toHaveFocus();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    await screen.findByRole("alertdialog");
    await user.click(
      screen.getByRole("button", { name: "Descartar alterações" }),
    );
    expect(onClose).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("does not confirm or save when the skill set is unchanged despite its order", async () => {
    const user = userEvent.setup();
    const put = vi.spyOn(apiClient, "put");
    const { onClose } = openEditor();
    await selectExcel(user);
    await user.click(
      screen.getByRole("button", { name: "Remover habilidade Liderança" }),
    );
    const catalog = screen.getByRole("list", {
      name: "Catálogo de habilidades",
    });
    await user.click(
      within(catalog).getByRole("button", { name: "Liderança" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Remover habilidade Excel" }),
    );
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(onClose).toHaveBeenCalledOnce();
    expect(put).not.toHaveBeenCalled();
  });

  it("explains a successful skills save followed by a profile failure and retries only the profile", async () => {
    const user = userEvent.setup();
    const put = vi
      .spyOn(apiClient, "put")
      .mockResolvedValueOnce({ data: [leadership, excel] });
    const patch = vi
      .spyOn(apiClient, "patch")
      .mockRejectedValueOnce(new ApiError({ message: "Network Error" }))
      .mockResolvedValueOnce({
        data: { ...profile, skills: [leadership, excel] },
      });
    const { onClose } = openEditor();
    await selectExcel(user);
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("As habilidades foram salvas.");
    await waitFor(() => expect(alert).toHaveFocus());
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await screen.findByText("Perfil atualizado com sucesso.");
    expect(put).toHaveBeenCalledTimes(1);
    expect(patch).toHaveBeenCalledTimes(2);
  });

  it("can close after partial success and refreshes the stored profile", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, "put").mockResolvedValueOnce({
      data: [leadership, excel],
    });
    vi.spyOn(apiClient, "patch").mockRejectedValueOnce(
      new ApiError({ message: "Network Error" }),
    );
    const { onClose, invalidate } = openEditor();
    await selectExcel(user);
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["candidates", "professional-profile"],
    });
  });

  it("keeps all selected skills and refreshes the catalog on skill_not_found", async () => {
    const user = userEvent.setup();
    const patch = vi.spyOn(apiClient, "patch");
    vi.spyOn(apiClient, "put").mockRejectedValueOnce(
      new ApiError({
        message: "Not found",
        code: "skill_not_found",
        status: 404,
      }),
    );
    const { onClose, invalidate } = openEditor();
    await selectExcel(user);
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Revise a seleção no catálogo e tente salvar novamente.",
    );
    expect(
      screen.getByRole("button", { name: "Remover habilidade Excel" }),
    ).toBeVisible();
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["skills", "catalog"],
    });
    expect(patch).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("blocks closing and draft changes while a save is in flight", async () => {
    const user = userEvent.setup();
    let finishSave!: (result: { data: (typeof leadership)[] }) => void;
    vi.spyOn(apiClient, "put").mockReturnValueOnce(
      new Promise((resolve) => {
        finishSave = resolve;
      }),
    );
    vi.spyOn(apiClient, "patch").mockRejectedValueOnce(
      new ApiError({ message: "Network Error" }),
    );
    const { onClose } = openEditor();
    await selectExcel(user);
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(screen.getByRole("button", { name: "Salvando..." })).toBeDisabled();
    expect(screen.getByLabelText("Buscar no catálogo")).toBeDisabled();
    expect(screen.getByLabelText("Nome completo")).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    finishSave({ data: [leadership] });
    await screen.findByRole("alert");
  });
});
