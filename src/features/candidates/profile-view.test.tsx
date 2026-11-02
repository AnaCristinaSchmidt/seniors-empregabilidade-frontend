import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import {
  cleanup,
  render as renderComponent,
  screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "@/lib/api-client";
import { ApiError } from "@/lib/api-error";

import { startDownload } from "./certification-download";
import { ProfileView } from "./profile-view";

vi.mock("@/lib/api-client", () => ({
  apiClient: { get: vi.fn(), patch: vi.fn() },
}));
vi.mock("./certification-download", () => ({ startDownload: vi.fn() }));

const validProfile = {
  id: "00000000-0000-4000-8000-000000000001",
  full_name: "Marcos Silveira",
  age: 58,
  email: "marcos@example.com",
  phone: "11988887777",
  city: "São Paulo",
  state: "SP",
  photo_url: null,
  summary: "Profissional de operações e logística.",
  experiences: [
    {
      id: "1",
      role: "Gerente de Operações",
      company_name: "Log Brasil",
      start_date: "2012-01-01",
      end_date: "2023-01-01",
      description: "Equipe de 40 pessoas em 3 centros de distribuição.",
    },
  ],
  education: [
    {
      id: "1",
      institution: "FGV",
      degree: "MBA",
      field: "Gestão Empresarial",
      start_date: "2010-01-01",
      end_date: "2011-12-01",
    },
  ],
  certifications: [
    {
      id: "c1",
      name: "NR-35",
      issuer: "SENAI",
      issued_date: "2020-03-01",
      expiration_date: "2022-03-01",
      document: {
        filename: "nr35.pdf",
        content_type: "application/pdf",
        size_bytes: 2048,
        uploaded_at: "2026-10-13T12:00:00Z",
      },
    },
    {
      id: "c2",
      name: "Excel Avançado",
      issuer: null,
      issued_date: "2018-05-01",
      expiration_date: null,
      document: null,
    },
  ],
  skills: [
    { id: "s1", name: "Liderança", type: "soft" },
    { id: "s2", name: "Logística", type: "hard" },
  ],
};

// Opening the edit modal also loads the skill catalog, so the catalog
// request is answered apart from the profile ones.
function mockGet(profileResponses: () => Promise<unknown>) {
  vi.spyOn(apiClient, "get").mockImplementation((url: string) =>
    url === "/skills" ? Promise.resolve({ data: [] }) : profileResponses(),
  );
}

function render(element: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderComponent(
    <QueryClientProvider client={client}>{element}</QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("ProfileView", () => {
  it("shows the profile once it loads", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValueOnce({ data: validProfile });

    render(<ProfileView />);

    expect(await screen.findByText("Marcos Silveira")).toBeVisible();
    expect(screen.getByText(/58 anos/)).toBeVisible();
    expect(screen.getByText("Gerente de Operações · Log Brasil")).toBeVisible();
    expect(screen.getByText("2012 – 2023")).toBeVisible();
    expect(screen.getByText("MBA em Gestão Empresarial")).toBeVisible();
    expect(screen.getByText("FGV · 2011")).toBeVisible();
    expect(screen.getByText("Liderança")).toBeVisible();
  });

  it("shows empty states for sections with no data", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValueOnce({
      data: {
        ...validProfile,
        experiences: [],
        education: [],
        certifications: [],
        skills: [],
      },
    });

    render(<ProfileView />);

    await screen.findByText("Marcos Silveira");
    expect(
      screen.getByText("Nenhuma experiência cadastrada ainda."),
    ).toBeVisible();
    expect(
      screen.getByText("Nenhuma formação cadastrada ainda."),
    ).toBeVisible();
    expect(
      screen.getByText("Nenhuma certificação cadastrada ainda."),
    ).toBeVisible();
    expect(
      screen.getByText("Nenhuma habilidade cadastrada ainda."),
    ).toBeVisible();
  });

  it("shows an empty state for summary and omits the location line when both are null", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValueOnce({
      data: { ...validProfile, summary: null, city: null, state: null },
    });

    render(<ProfileView />);

    await screen.findByText("Marcos Silveira");
    expect(screen.getByText("Nenhum resumo cadastrado ainda.")).toBeVisible();
    expect(screen.queryByText(/^Cidade:/)).not.toBeInTheDocument();
  });

  it("shows an error state with a retry action when the request fails", async () => {
    const user = userEvent.setup();
    const get = vi
      .spyOn(apiClient, "get")
      .mockRejectedValueOnce(
        new ApiError({
          message: "The professional profile was not found.",
          code: "profile_not_found",
        }),
      )
      .mockResolvedValueOnce({ data: validProfile });

    render(<ProfileView />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não encontramos seu perfil de candidato.",
    );

    await user.click(screen.getByRole("button", { name: /tentar novamente/i }));

    expect(await screen.findByText("Marcos Silveira")).toBeVisible();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("opens the edit profile modal, pre-filled, when the edit button is clicked", async () => {
    const user = userEvent.setup();
    mockGet(
      vi
        .fn<() => Promise<unknown>>()
        .mockResolvedValueOnce({ data: validProfile }),
    );

    render(<ProfileView />);

    await screen.findByText("Marcos Silveira");
    await user.click(screen.getByRole("button", { name: /editar perfil/i }));

    expect(
      await screen.findByRole("dialog", { name: /editar perfil/i }),
    ).toBeVisible();
    expect(screen.getByLabelText(/nome completo/i)).toHaveValue(
      "Marcos Silveira",
    );
    expect(screen.getByLabelText(/^idade$/i)).toBeDisabled();
    expect(screen.getByLabelText(/^e-mail$/i)).toBeDisabled();
  });

  it("keeps the loaded profile and the open modal when a refetch fails", async () => {
    const user = userEvent.setup();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    mockGet(
      vi
        .fn<() => Promise<unknown>>()
        .mockResolvedValueOnce({ data: validProfile })
        .mockRejectedValueOnce(new ApiError({ message: "Network Error" })),
    );

    renderComponent(
      <QueryClientProvider client={client}>
        <ProfileView />
      </QueryClientProvider>,
    );

    await screen.findByText("Marcos Silveira");
    await user.click(screen.getByRole("button", { name: /editar perfil/i }));
    await client.refetchQueries({
      queryKey: ["candidates", "professional-profile"],
    });

    expect(
      screen.getByRole("dialog", { name: /editar perfil/i }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /tentar novamente/i }),
    ).not.toBeInTheDocument();
  });

  it("lists certifications and downloads a document", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, "get")
      .mockResolvedValueOnce({ data: validProfile })
      .mockResolvedValueOnce({
        data: {
          url: "https://storage.example.invalid/c1?sig=1",
          expires_at: "2026-10-13T12:05:00Z",
        },
      });

    render(<ProfileView />);

    expect(await screen.findByText("SENAI · 2020 – 2022")).toBeVisible();
    expect(screen.getByText("Emitida em 2018")).toBeVisible();
    expect(
      screen.queryByRole("button", {
        name: "Baixar comprovante de Excel Avançado",
      }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Baixar comprovante de NR-35" }),
    );

    expect(startDownload).toHaveBeenCalledWith(
      "https://storage.example.invalid/c1?sig=1",
    );
  });

  it("explains a failed download", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, "get")
      .mockResolvedValueOnce({ data: validProfile })
      .mockRejectedValueOnce(
        new ApiError({
          message: "unavailable",
          status: 503,
          code: "document_storage_unavailable",
        }),
      );

    render(<ProfileView />);
    await user.click(
      await screen.findByRole("button", {
        name: "Baixar comprovante de NR-35",
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "O envio de arquivos está indisponível agora.",
    );
  });
});

describe("ProfileView - automatic application", () => {
  const toggle = () =>
    screen.getByRole("switch", { name: "Candidaturas automáticas" });

  it("hides the choice while the API does not return it", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValueOnce({ data: validProfile });

    render(<ProfileView />);

    await screen.findByText("Marcos Silveira");
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("explains the choice and saves only this field when turned on", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, "get").mockResolvedValueOnce({
      data: { ...validProfile, accepts_automatic_application: false },
    });
    const patch = vi.spyOn(apiClient, "patch").mockResolvedValueOnce({
      data: { ...validProfile, accepts_automatic_application: true },
    });

    render(<ProfileView />);
    await screen.findByText("Marcos Silveira");
    expect(toggle()).not.toBeChecked();
    expect(screen.getByText("Desligadas")).toBeVisible();
    expect(toggle()).toHaveAccessibleDescription(
      /candidata você automaticamente às vagas com alta compatibilidade.*Vem ligado por padrão/,
    );

    await user.click(toggle());

    expect(patch).toHaveBeenCalledWith("/professionals/me", {
      accepts_automatic_application: true,
    });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Candidaturas automáticas ligadas.",
    );
    expect(toggle()).toBeChecked();
    expect(screen.getByText("Ligadas")).toBeVisible();
    expect(toggle()).not.toHaveAttribute("aria-disabled", "true");
    expect(toggle()).toHaveFocus();
  });

  it("turns the choice off", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, "get").mockResolvedValueOnce({
      data: { ...validProfile, accepts_automatic_application: true },
    });
    vi.spyOn(apiClient, "patch").mockResolvedValueOnce({
      data: { ...validProfile, accepts_automatic_application: false },
    });

    render(<ProfileView />);
    await screen.findByText("Marcos Silveira");
    expect(toggle()).toBeChecked();

    await user.click(toggle());

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Candidaturas automáticas desligadas.",
    );
    expect(toggle()).not.toBeChecked();
  });

  it("keeps the saved choice and explains a failure", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, "get").mockResolvedValueOnce({
      data: { ...validProfile, accepts_automatic_application: false },
    });
    vi.spyOn(apiClient, "patch").mockRejectedValueOnce(
      new ApiError({ message: "Network error.", code: "network_error" }),
    );

    render(<ProfileView />);
    await screen.findByText("Marcos Silveira");

    await user.click(toggle());

    expect(await screen.findByRole("alert")).toBeVisible();
    expect(toggle()).not.toBeChecked();
    expect(toggle()).not.toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("status")).not.toHaveTextContent("ligadas");
  });
});
