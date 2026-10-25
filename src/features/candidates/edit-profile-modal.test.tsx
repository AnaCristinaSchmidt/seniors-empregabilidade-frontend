import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import {
  cleanup,
  fireEvent,
  render as renderComponent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "@/lib/api-client";
import { ApiError } from "@/lib/api-error";

import { startDownload } from "./certification-download";
import { EditProfileModal } from "./edit-profile-modal";
import type { ProfessionalProfile } from "./professional-profile-schema";

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));
vi.mock("./certification-download", () => ({ startDownload: vi.fn() }));

const baseProfile: ProfessionalProfile = {
  id: "00000000-0000-4000-8000-000000000001",
  full_name: "Marcos Silveira",
  age: 58,
  email: "marcos@example.com",
  phone: "11988887777",
  city: "São Paulo",
  state: "SP",
  photo_url: null,
  summary: "Profissional de operações e logística.",
  experiences: [],
  education: [],
  certifications: [],
  skills: [{ id: "s1", name: "Liderança", type: "soft" }],
};

const profileQueryKey = ["candidates", "professional-profile"];

function render(element: ReactElement, client = new QueryClient()) {
  return renderComponent(
    <QueryClientProvider client={client}>{element}</QueryClientProvider>,
  );
}

// The skill section loads the catalog as soon as the modal opens.
beforeEach(() => {
  vi.spyOn(apiClient, "get").mockResolvedValue({
    data: [
      { id: "s1", name: "Liderança", type: "soft" },
      { id: "s2", name: "Negociação", type: "soft" },
    ],
  });
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("EditProfileModal", () => {
  describe("experience", () => {
    it("persists a new experience and shows it in the list", async () => {
      const user = userEvent.setup();
      const post = vi.spyOn(apiClient, "post").mockResolvedValueOnce({
        data: {
          id: "exp-1",
          role: "Analista",
          company_name: "Empresa X",
          start_date: "2020-01-01",
          end_date: null,
          description: null,
        },
      });

      render(
        <EditProfileModal open onOpenChange={vi.fn()} profile={baseProfile} />,
      );

      await user.click(
        screen.getByRole("button", { name: /adicionar experiência/i }),
      );
      await user.type(screen.getByLabelText(/^cargo$/i), "  Analista ");
      await user.type(screen.getByLabelText(/^empresa$/i), "Empresa X");
      fireEvent.change(screen.getByLabelText(/^início$/i), {
        target: { value: "2020-01-01" },
      });
      await user.click(screen.getByRole("button", { name: /concluir/i }));

      expect(await screen.findByText("Analista · Empresa X")).toBeVisible();
      expect(post).toHaveBeenCalledWith("/professionals/me/experiences", {
        role: "Analista",
        company_name: "Empresa X",
        start_date: "2020-01-01",
        end_date: null,
        description: null,
      });
    });

    it("cancels a new (empty) experience without leaving a blank card behind", async () => {
      const user = userEvent.setup();
      const post = vi.spyOn(apiClient, "post");
      render(
        <EditProfileModal open onOpenChange={vi.fn()} profile={baseProfile} />,
      );

      await user.click(
        screen.getByRole("button", { name: /adicionar experiência/i }),
      );
      await user.click(
        screen.getAllByRole("button", { name: /^cancelar$/i })[0]!,
      );

      expect(
        screen.getByText("Nenhuma experiência cadastrada ainda."),
      ).toBeVisible();
      expect(post).not.toHaveBeenCalled();
    });

    it("edits and removes an experience through its own endpoint", async () => {
      const user = userEvent.setup();
      const existing = {
        id: "exp-9",
        role: "Gerente",
        company_name: "Log Brasil",
        start_date: "2012-01-01",
        end_date: "2023-01-01",
        description: null,
      };
      const patch = vi.spyOn(apiClient, "patch").mockResolvedValueOnce({
        data: { ...existing, role: "Diretor" },
      });
      const remove = vi
        .spyOn(apiClient, "delete")
        .mockResolvedValueOnce({ data: undefined });

      render(
        <EditProfileModal
          open
          onOpenChange={vi.fn()}
          profile={{ ...baseProfile, experiences: [existing] }}
        />,
      );

      await user.click(screen.getByRole("button", { name: /^editar$/i }));
      const role = screen.getByLabelText(/^cargo$/i);
      await user.clear(role);
      await user.type(role, "Diretor");
      await user.click(screen.getByRole("button", { name: /concluir/i }));

      expect(await screen.findByText("Diretor · Log Brasil")).toBeVisible();
      expect(patch).toHaveBeenCalledWith(
        "/professionals/me/experiences/exp-9",
        expect.objectContaining({ role: "Diretor" }),
      );

      await user.click(screen.getByRole("button", { name: /^remover$/i }));

      expect(
        await screen.findByText("Nenhuma experiência cadastrada ainda."),
      ).toBeVisible();
      expect(remove).toHaveBeenCalledWith(
        "/professionals/me/experiences/exp-9",
      );
    });

    it("explains a period the backend rejects", async () => {
      const user = userEvent.setup();
      vi.spyOn(apiClient, "post").mockRejectedValueOnce(
        new ApiError({
          message: "The end date cannot be before the start date.",
          status: 422,
          code: "invalid_experience_period",
        }),
      );

      render(
        <EditProfileModal open onOpenChange={vi.fn()} profile={baseProfile} />,
      );

      await user.click(
        screen.getByRole("button", { name: /adicionar experiência/i }),
      );
      await user.type(screen.getByLabelText(/^cargo$/i), "Analista");
      await user.type(screen.getByLabelText(/^empresa$/i), "Empresa X");
      fireEvent.change(screen.getByLabelText(/^início$/i), {
        target: { value: "2020-01-01" },
      });
      await user.click(screen.getByRole("button", { name: /concluir/i }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "A data de fim não pode ser anterior à data de início.",
      );
    });
  });

  describe("education", () => {
    it("persists a new education through the education endpoint", async () => {
      const user = userEvent.setup();
      const post = vi.spyOn(apiClient, "post").mockResolvedValueOnce({
        data: {
          id: "edu-1",
          institution: "FGV",
          degree: "MBA",
          field: null,
          start_date: null,
          end_date: null,
        },
      });

      render(
        <EditProfileModal open onOpenChange={vi.fn()} profile={baseProfile} />,
      );

      await user.click(
        screen.getByRole("button", { name: /adicionar formação/i }),
      );
      await user.type(screen.getByLabelText(/^instituição$/i), "FGV");
      await user.type(screen.getByLabelText(/curso\/grau/i), "MBA");
      await user.click(screen.getByRole("button", { name: /concluir/i }));

      expect(await screen.findByText("MBA")).toBeVisible();
      expect(post).toHaveBeenCalledWith("/professionals/me/education", {
        institution: "FGV",
        degree: "MBA",
        field: null,
        start_date: null,
        end_date: null,
      });
    });
  });

  describe("skills", () => {
    const negotiation = { id: "s2", name: "Negociação", type: "soft" };

    async function chooseNegotiationInsteadOfLeadership(
      user: ReturnType<typeof userEvent.setup>,
    ) {
      const catalog = await screen.findByRole("list", {
        name: "Catálogo de habilidades",
      });
      await user.click(
        within(catalog).getByRole("button", { name: "Negociação" }),
      );
      await user.click(
        screen.getByRole("button", { name: "Remover habilidade Liderança" }),
      );
    }

    it("saves the chosen skills together with the résumé", async () => {
      const user = userEvent.setup();
      const client = new QueryClient();
      const put = vi
        .spyOn(apiClient, "put")
        .mockResolvedValueOnce({ data: [negotiation] });
      const saved = { ...baseProfile, skills: [negotiation] };
      const patch = vi
        .spyOn(apiClient, "patch")
        .mockResolvedValueOnce({ data: saved });

      render(
        <EditProfileModal open onOpenChange={vi.fn()} profile={baseProfile} />,
        client,
      );

      await chooseNegotiationInsteadOfLeadership(user);
      expect(put).not.toHaveBeenCalled();

      await user.click(
        screen.getByRole("button", { name: /salvar alterações/i }),
      );

      await screen.findByText("Perfil atualizado com sucesso.");
      expect(put).toHaveBeenCalledWith("/professionals/me/skills", {
        skill_ids: ["s2"],
      });
      expect(patch.mock.invocationCallOrder[0]).toBeGreaterThan(
        put.mock.invocationCallOrder[0]!,
      );
      expect(client.getQueryData(profileQueryKey)).toEqual(saved);
    });

    it("confirms before discarding the chosen skills", async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      const remove = vi.spyOn(apiClient, "delete");
      const post = vi.spyOn(apiClient, "post");

      render(
        <EditProfileModal
          open
          onOpenChange={onOpenChange}
          profile={baseProfile}
        />,
      );

      await chooseNegotiationInsteadOfLeadership(user);
      await user.click(screen.getByRole("button", { name: /^cancelar$/i }));

      expect(onOpenChange).not.toHaveBeenCalled();
      await user.click(
        screen.getByRole("button", { name: "Descartar alterações" }),
      );
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(remove).not.toHaveBeenCalled();
      expect(post).not.toHaveBeenCalled();
    });

    it("keeps the selection when bulk saving fails and retries the whole set", async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      const put = vi
        .spyOn(apiClient, "put")
        .mockRejectedValueOnce(new ApiError({ message: "Network Error" }))
        .mockResolvedValueOnce({ data: [negotiation] });
      const patch = vi.spyOn(apiClient, "patch").mockResolvedValueOnce({
        data: { ...baseProfile, skills: [negotiation] },
      });

      render(
        <EditProfileModal
          open
          onOpenChange={onOpenChange}
          profile={baseProfile}
        />,
      );

      await chooseNegotiationInsteadOfLeadership(user);
      await user.click(
        screen.getByRole("button", { name: /salvar alterações/i }),
      );

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Não foi possível salvar a alteração. Tente novamente.",
      );
      expect(patch).not.toHaveBeenCalled();
      expect(onOpenChange).not.toHaveBeenCalled();

      await user.click(
        screen.getByRole("button", { name: /salvar alterações/i }),
      );

      await screen.findByText("Perfil atualizado com sucesso.");
      expect(put).toHaveBeenCalledTimes(2);
      expect(put).toHaveBeenNthCalledWith(2, "/professionals/me/skills", {
        skill_ids: ["s2"],
      });
      expect(patch).toHaveBeenCalledTimes(1);
    });
  });

  it("shows the photo upload as unavailable", () => {
    render(
      <EditProfileModal open onOpenChange={vi.fn()} profile={baseProfile} />,
    );

    expect(screen.getByRole("button", { name: /enviar foto/i })).toBeDisabled();
    expect(
      screen.getByText("O envio de foto ainda não está disponível."),
    ).toBeVisible();
  });

  it("only sends the 5 backend-supported fields when saving", async () => {
    const user = userEvent.setup();
    const patch = vi.spyOn(apiClient, "patch").mockResolvedValueOnce({
      data: baseProfile,
    });

    render(
      <EditProfileModal open onOpenChange={vi.fn()} profile={baseProfile} />,
    );

    await user.click(
      screen.getByRole("button", { name: /adicionar experiência/i }),
    );
    await user.click(
      screen.getByRole("button", { name: /salvar alterações/i }),
    );

    expect(patch).toHaveBeenCalledWith("/professionals/me", {
      full_name: baseProfile.full_name,
      phone: baseProfile.phone,
      city: baseProfile.city,
      state: baseProfile.state,
      summary: baseProfile.summary,
    });
  });

  it("shows an explicit success message after saving", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, "patch").mockResolvedValueOnce({ data: baseProfile });

    render(
      <EditProfileModal open onOpenChange={vi.fn()} profile={baseProfile} />,
    );

    await user.click(
      screen.getByRole("button", { name: /salvar alterações/i }),
    );

    expect(
      await screen.findByText("Perfil atualizado com sucesso."),
    ).toHaveAttribute("role", "status");
  });

  it("replaces the cached profile with the saved one", async () => {
    const user = userEvent.setup();
    const client = new QueryClient();
    const saved = { ...baseProfile, full_name: "Marcos S. Silveira" };
    vi.spyOn(apiClient, "patch").mockResolvedValueOnce({ data: saved });

    render(
      <EditProfileModal open onOpenChange={vi.fn()} profile={baseProfile} />,
      client,
    );

    await user.click(
      screen.getByRole("button", { name: /salvar alterações/i }),
    );

    await screen.findByText("Perfil atualizado com sucesso.");
    expect(client.getQueryData(profileQueryKey)).toEqual(saved);
  });

  it("explains a save failure without closing the modal", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    vi.spyOn(apiClient, "patch").mockRejectedValueOnce(
      new ApiError({
        message: "Validation failed.",
        status: 422,
        code: "validation_error",
      }),
    );

    render(
      <EditProfileModal
        open
        onOpenChange={onOpenChange}
        profile={baseProfile}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /salvar alterações/i }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Alguns dados não foram aceitos. Revise os campos e tente novamente.",
    );
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("refreshes the stored profile when the modal closes", async () => {
    const user = userEvent.setup();
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const onOpenChange = vi.fn();

    render(
      <EditProfileModal
        open
        onOpenChange={onOpenChange}
        profile={baseProfile}
      />,
      client,
    );

    await user.click(screen.getByRole("button", { name: /^cancelar$/i }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: profileQueryKey });
  });

  describe("certifications", () => {
    const savedCertification = {
      id: "cert-1",
      name: "NR-35",
      issuer: "SENAI",
      issued_date: "2020-03-01",
      expiration_date: null,
      document: null,
    };
    const document = {
      filename: "nr35.pdf",
      content_type: "application/pdf",
      size_bytes: 2048,
      uploaded_at: "2026-10-13T12:00:00Z",
    };
    const pdf = () =>
      new File(["%PDF-1.7"], "nr35.pdf", { type: "application/pdf" });

    async function fillNewCertification(
      user: ReturnType<typeof userEvent.setup>,
    ) {
      await user.click(
        screen.getByRole("button", { name: /adicionar certificação/i }),
      );
      await user.type(screen.getByLabelText(/nome da certificação/i), "NR-35");
      await user.type(screen.getByLabelText(/instituição emissora/i), "SENAI");
      fireEvent.change(screen.getByLabelText(/data de emissão/i), {
        target: { value: "2020-03-01" },
      });
    }

    it("creates a certification and uploads its document", async () => {
      const user = userEvent.setup();
      const post = vi
        .spyOn(apiClient, "post")
        .mockResolvedValueOnce({ data: savedCertification });
      const put = vi
        .spyOn(apiClient, "put")
        .mockResolvedValueOnce({ data: { ...savedCertification, document } });
      render(
        <EditProfileModal open onOpenChange={vi.fn()} profile={baseProfile} />,
      );

      await fillNewCertification(user);
      await user.upload(screen.getByLabelText(/^comprovante$/i), pdf());
      await user.click(screen.getByRole("button", { name: /concluir/i }));

      expect(
        await screen.findByText("Comprovante: nr35.pdf (2 KB)"),
      ).toBeVisible();
      expect(post).toHaveBeenCalledWith("/professionals/me/certifications", {
        name: "NR-35",
        issuer: "SENAI",
        issued_date: "2020-03-01",
        expiration_date: null,
      });
      expect(put.mock.calls[0]![0]).toBe(
        "/professionals/me/certifications/cert-1/document",
      );
    });

    it("rejects an unsupported file before calling the API", async () => {
      const user = userEvent.setup();
      const post = vi.spyOn(apiClient, "post");
      render(
        <EditProfileModal open onOpenChange={vi.fn()} profile={baseProfile} />,
      );

      await fillNewCertification(user);
      fireEvent.change(screen.getByLabelText(/^comprovante$/i), {
        target: {
          files: [
            new File(["x"], "carta.docx", { type: "application/msword" }),
          ],
        },
      });
      await user.click(screen.getByRole("button", { name: /concluir/i }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Envie um arquivo PDF, PNG ou JPG.",
      );
      expect(post).not.toHaveBeenCalled();
    });

    it("keeps a saved certification when the upload fails and retries without duplicating it", async () => {
      const user = userEvent.setup();
      const post = vi
        .spyOn(apiClient, "post")
        .mockResolvedValueOnce({ data: savedCertification });
      const patch = vi
        .spyOn(apiClient, "patch")
        .mockResolvedValueOnce({ data: savedCertification });
      vi.spyOn(apiClient, "put")
        .mockRejectedValueOnce(
          new ApiError({
            message: "unavailable",
            status: 503,
            code: "document_storage_unavailable",
          }),
        )
        .mockResolvedValueOnce({ data: { ...savedCertification, document } });
      render(
        <EditProfileModal open onOpenChange={vi.fn()} profile={baseProfile} />,
      );

      await fillNewCertification(user);
      await user.upload(screen.getByLabelText(/^comprovante$/i), pdf());
      await user.click(screen.getByRole("button", { name: /concluir/i }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "O envio de arquivos está indisponível agora.",
      );

      await user.click(screen.getByRole("button", { name: /concluir/i }));

      expect(
        await screen.findByText("Comprovante: nr35.pdf (2 KB)"),
      ).toBeVisible();
      expect(post).toHaveBeenCalledOnce();
      expect(patch).toHaveBeenCalledWith(
        "/professionals/me/certifications/cert-1",
        expect.objectContaining({ name: "NR-35" }),
      );
    });

    it("blocks an expiration before the issue date", async () => {
      const user = userEvent.setup();
      const post = vi.spyOn(apiClient, "post");
      render(
        <EditProfileModal open onOpenChange={vi.fn()} profile={baseProfile} />,
      );

      await fillNewCertification(user);
      fireEvent.change(screen.getByLabelText(/validade/i), {
        target: { value: "2019-01-01" },
      });
      await user.click(screen.getByRole("button", { name: /concluir/i }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "A validade não pode ser anterior à data de emissão.",
      );
      expect(post).not.toHaveBeenCalled();
    });

    it("removes the document of an existing certification", async () => {
      const user = userEvent.setup();
      const remove = vi.spyOn(apiClient, "delete").mockResolvedValueOnce({});
      render(
        <EditProfileModal
          open
          onOpenChange={vi.fn()}
          profile={{
            ...baseProfile,
            certifications: [{ ...savedCertification, document }],
          }}
        />,
      );

      await user.click(
        screen.getByRole("button", { name: "Editar certificação NR-35" }),
      );
      expect(screen.getByText("Arquivo atual: nr35.pdf")).toBeVisible();
      await user.click(
        screen.getByRole("button", { name: /remover comprovante/i }),
      );
      await user.click(
        screen.getAllByRole("button", { name: /^cancelar$/i })[0]!,
      );

      expect(await screen.findByText("Sem comprovante")).toBeVisible();
      expect(remove).toHaveBeenCalledWith(
        "/professionals/me/certifications/cert-1/document",
      );
    });

    it("downloads the document through a short-lived link", async () => {
      const user = userEvent.setup();
      vi.spyOn(apiClient, "get").mockImplementation((url: string) =>
        Promise.resolve({
          data: url.endsWith("/document")
            ? {
                url: "https://storage.example.invalid/cert-1?sig=1",
                expires_at: "2026-10-13T12:05:00Z",
              }
            : [],
        }),
      );
      render(
        <EditProfileModal
          open
          onOpenChange={vi.fn()}
          profile={{
            ...baseProfile,
            certifications: [{ ...savedCertification, document }],
          }}
        />,
      );

      await user.click(
        screen.getByRole("button", { name: "Baixar comprovante de NR-35" }),
      );

      await waitFor(() =>
        expect(startDownload).toHaveBeenCalledWith(
          "https://storage.example.invalid/cert-1?sig=1",
        ),
      );
    });

    it("removes a certification and shows the empty state", async () => {
      const user = userEvent.setup();
      const remove = vi.spyOn(apiClient, "delete").mockResolvedValueOnce({});
      render(
        <EditProfileModal
          open
          onOpenChange={vi.fn()}
          profile={{ ...baseProfile, certifications: [savedCertification] }}
        />,
      );

      await user.click(
        screen.getByRole("button", { name: "Remover certificação NR-35" }),
      );

      expect(
        await screen.findByText("Nenhuma certificação cadastrada ainda."),
      ).toBeVisible();
      expect(remove).toHaveBeenCalledWith(
        "/professionals/me/certifications/cert-1",
      );
    });

    it("shows why a removal failed", async () => {
      const user = userEvent.setup();
      vi.spyOn(apiClient, "delete").mockRejectedValueOnce(
        new ApiError({
          message: "gone",
          status: 404,
          code: "certification_not_found",
        }),
      );
      render(
        <EditProfileModal
          open
          onOpenChange={vi.fn()}
          profile={{ ...baseProfile, certifications: [savedCertification] }}
        />,
      );

      await user.click(
        screen.getByRole("button", { name: "Remover certificação NR-35" }),
      );

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Esta certificação não existe mais.",
      );
    });
  });
});
