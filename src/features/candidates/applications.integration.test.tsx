import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "@/lib/api-client";
import { ApiError } from "@/lib/api-error";
import ApplicationsPage from "./applications";
import {
  fetchApplications,
  withdrawApplication,
  type Application,
} from "./applications-schema";

const active: Application = {
  id: "10000000-0000-4000-8000-000000000001",
  job_id: "20000000-0000-4000-8000-000000000001",
  job_title: "Analista",
  company_name: "Empresa Aurora",
  submitted_at: "2026-08-05T02:00:00Z",
  days_in_process: 7,
  status: "under_review",
  similar_jobs: [],
};
const closed: Application = {
  ...active,
  id: "10000000-0000-4000-8000-000000000002",
  job_id: "20000000-0000-4000-8000-000000000002",
  status: "not_selected",
  reason: "Perfil não alinhado aos requisitos.",
  company_name: "Empresa Horizonte",
  similar_jobs: [
    {
      id: "30000000-0000-4000-8000-000000000001",
      title: "Supervisão",
      company_name: "Empresa Exemplo",
    },
  ],
};
const originalAdapter = apiClient.defaults.adapter;

afterEach(() => {
  if (originalAdapter === undefined) {
    delete apiClient.defaults.adapter;
  } else {
    apiClient.defaults.adapter = originalAdapter;
  }
  vi.restoreAllMocks();
});

function response(config: InternalAxiosRequestConfig, data: unknown) {
  return { config, data, status: 200, statusText: "OK", headers: {} };
}

function failure(
  config: InternalAxiosRequestConfig,
  status: number,
  code: string,
) {
  return new AxiosError("Request failed", undefined, config, undefined, {
    ...response(config, { title: "Request failed", status, code }),
    status,
  });
}

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <ApplicationsPage />
    </QueryClientProvider>,
  );
  return client;
}

async function confirm() {
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Sair do processo" }),
  );
  await user.click(
    within(screen.getByRole("alertdialog")).getByRole("button", {
      name: "Sair do processo",
    }),
  );
}

describe("application API integration", () => {
  it("passes the company filter and cancellation signal to the real HTTP client", async () => {
    const controller = new AbortController();
    const requests: InternalAxiosRequestConfig[] = [];
    apiClient.defaults.adapter = (config) => {
      requests.push(config);
      return Promise.resolve(response(config, [active]));
    };
    expect(
      await fetchApplications({
        companyName: "Aurora",
        signal: controller.signal,
      }),
    ).toEqual([active]);
    expect(requests[0]?.url).toBe("/applications/me");
    expect(requests[0]?.params).toEqual({ company_name: "Aurora" });
    expect(requests[0]?.signal).toBe(controller.signal);
  });

  it("validates the withdrawal response and rejects mismatched data", async () => {
    const updated = { ...active, status: "withdrawn" };
    apiClient.defaults.adapter = (config) =>
      Promise.resolve(response(config, updated));
    expect(await withdrawApplication(active.id)).toEqual(updated);
    await expect(withdrawApplication(closed.id)).rejects.toBeInstanceOf(
      ApiError,
    );
    apiClient.defaults.adapter = (config) =>
      Promise.resolve(response(config, active));
    await expect(withdrawApplication(active.id)).rejects.toBeInstanceOf(
      ApiError,
    );
    apiClient.defaults.adapter = (config) =>
      Promise.resolve(response(config, [{}]));
    await expect(fetchApplications()).rejects.toBeInstanceOf(ApiError);
  });

  it("updates the card from the POST response even if refreshing the list fails", async () => {
    let withdrawn = false;
    apiClient.defaults.adapter = (config) => {
      if (config.method === "post") {
        withdrawn = true;
        return Promise.resolve(
          response(config, { ...active, status: "withdrawn" }),
        );
      }
      if (withdrawn) return Promise.reject(failure(config, 503, "unavailable"));
      return Promise.resolve(response(config, [active]));
    };
    mount();
    await confirm();
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    const card = screen.getByRole("article", {
      name: "Analista · Empresa Aurora",
    });
    expect(
      within(card).getByText("Você saiu do processo seletivo"),
    ).toBeVisible();
    expect(
      within(card).queryByRole("button", { name: "Sair do processo" }),
    ).not.toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "erro ao carregar",
    );
  });

  it("announces the withdrawal and moves focus to the updated card title", async () => {
    let withdrawn = false;
    apiClient.defaults.adapter = (config) => {
      if (config.method === "post") {
        withdrawn = true;
        return Promise.resolve(
          response(config, { ...active, status: "withdrawn" }),
        );
      }
      return Promise.resolve(
        response(config, [
          withdrawn ? { ...active, status: "withdrawn" } : active,
        ]),
      );
    };
    mount();
    await confirm();
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Você saiu do processo seletivo.",
    );
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Analista · Empresa Aurora" }),
      ).toHaveFocus(),
    );
  });

  it.each([
    [
      409,
      "application_already_closed",
      "Esta candidatura já foi encerrada",
      "Analista · Empresa Aurora",
    ],
    [
      404,
      "application_not_found",
      "Esta candidatura não está mais disponível",
      "Candidaturas",
    ],
  ])(
    "reconciles a %s without allowing another destructive request",
    async (status, code, message, focusedHeading) => {
      let posted = false;
      apiClient.defaults.adapter = (config) => {
        if (config.method === "post") {
          posted = true;
          return Promise.reject(failure(config, status, code));
        }
        return Promise.resolve(
          response(
            config,
            posted
              ? status === 404
                ? []
                : [{ ...active, status: "not_selected" }]
              : [active],
          ),
        );
      };
      mount();
      await confirm();
      expect(await screen.findByRole("alert")).toHaveTextContent(message);
      expect(
        within(screen.getByRole("alertdialog")).getByRole("button", {
          name: "Sair do processo",
        }),
      ).toBeDisabled();
      expect(screen.getByRole("button", { name: "Cancelar" })).toBeEnabled();

      // The refreshed list no longer offers the button that opened the dialog.
      await userEvent
        .setup()
        .click(screen.getByRole("button", { name: "Cancelar" }));
      await waitFor(() =>
        expect(
          screen.getByRole("heading", { name: focusedHeading }),
        ).toHaveFocus(),
      );
    },
  );

  it("reconciles a lost response with the persisted withdrawal instead of retrying", async () => {
    let posted = false;
    apiClient.defaults.adapter = (config) => {
      if (config.method === "post") {
        posted = true;
        return Promise.reject(
          new AxiosError("Network Error", "ERR_NETWORK", config),
        );
      }
      return Promise.resolve(
        response(config, [
          { ...active, status: posted ? "withdrawn" : active.status },
        ]),
      );
    };
    mount();
    await confirm();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "você já saiu deste processo",
    );
    expect(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Sair do processo",
      }),
    ).toBeDisabled();
  });

  it("uses server-side filtering, São Paulo dates and returned suggestions", async () => {
    const filters: unknown[] = [];
    apiClient.defaults.adapter = (config) => {
      const params = config.params as { company_name?: string } | undefined;
      filters.push(params?.company_name);
      const items =
        params?.company_name === "Horizonte" ? [closed] : [active, closed];
      return Promise.resolve(response(config, items));
    };
    const user = userEvent.setup();
    mount();
    expect(
      await screen.findByText("Enviada em 4 de agosto · 7 dias em processo."),
    ).toBeVisible();
    await user.click(screen.getByRole("textbox"));
    await user.paste("Horizonte");
    await waitFor(() =>
      expect(
        screen.queryByRole("article", { name: "Analista · Empresa Aurora" }),
      ).not.toBeInTheDocument(),
    );
    expect(filters).toContain("Horizonte");
    expect(
      screen.getByText("Motivo: Perfil não alinhado aos requisitos."),
    ).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Ver vagas parecidas" }),
    );
    expect(screen.getByText("Supervisão")).toBeVisible();
    expect(screen.getByText("Empresa Exemplo")).toBeVisible();
  });

  it("explains when a rejected application has no available suggestions", async () => {
    apiClient.defaults.adapter = (config) =>
      Promise.resolve(response(config, [{ ...closed, similar_jobs: [] }]));
    const user = userEvent.setup();
    mount();
    await user.click(
      await screen.findByRole("button", { name: "Ver vagas parecidas" }),
    );
    expect(
      screen.getByText("Nenhuma vaga parecida disponível no momento."),
    ).toBeVisible();
  });
});
