import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterContextProvider,
  RouterProvider,
  type AnyRoute,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";
import { queryClient as appQueryClient } from "@/lib/query-client";
import { clearSession, writeAccessToken } from "@/lib/session-storage";
import {
  stubApiRoutes,
  type ApiStub,
  type StubResponse,
} from "../../../tests/api-stub";
import { jobDetail } from "../../../tests/job-detail-fixture";

import type { JobDetail } from "./job-detail-schema";
import { JobVacancyDetailPage } from "./job-vacancy-detail-page";

const application = {
  id: "10000000-0000-4000-8000-000000000001",
  job_id: jobDetail.id,
  job_title: "Analista",
  company_name: "Empresa Aurora",
  submitted_at: "2026-08-05T02:00:00Z",
  days_in_process: 7,
  status: "under_review" as const,
  similar_jobs: [],
};

let stub: ApiStub | undefined;

afterEach(() => {
  stub?.restore();
  stub = undefined;
  appQueryClient.clear();
  clearSession();
});

function mountPage(detail: JobDetail) {
  stub = stubApiRoutes({
    [`GET /jobs/${detail.id}`]: { status: 200, data: detail },
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createRouter({
    routeTree: createRootRoute(),
    history: createMemoryHistory({
      initialEntries: [`/candidato/vagas/${detail.id}`],
    }),
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <RouterContextProvider router={router}>{children}</RouterContextProvider>
    </QueryClientProvider>
  );
  render(<JobVacancyDetailPage jobId={detail.id} />, { wrapper });
}

function detailRequests(): string[] {
  return (
    stub?.requests
      .filter((request) => request.url?.startsWith("/jobs/"))
      .map((request) => `${request.method?.toUpperCase()} ${request.url}`) ?? []
  );
}

describe("JobVacancyDetailPage", () => {
  it("enables applying when the detail says the job is open", async () => {
    mountPage(jobDetail);

    expect(
      await screen.findByRole("heading", { name: jobDetail.title, level: 2 }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Detalhes da vaga", level: 1 }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Voltar para candidaturas" }),
    ).toHaveAttribute("href", "/candidato/candidaturas");
    expect(screen.getByRole("button", { name: "Candidatar-se" })).toBeEnabled();
    expect(detailRequests()).toEqual([`GET /jobs/${jobDetail.id}`]);
    expect(
      stub?.requests.some((request) => request.url === "/applications/me"),
    ).toBe(false);
  });

  it.each([
    {
      label: "Vaga encerrada",
      overrides: {
        status: "closed" as const,
        is_open: false,
        is_expired: false,
      },
    },
    {
      label: "Vaga expirada",
      overrides: {
        status: "expired" as const,
        is_open: false,
        is_expired: true,
      },
    },
  ])(
    "blocks applying when the detail says the job is $label",
    async ({ label, overrides }) => {
      mountPage({
        ...jobDetail,
        ...overrides,
        already_applied: false,
        is_applicable: false,
      });

      expect(
        await screen.findByRole("heading", { name: jobDetail.title, level: 2 }),
      ).toBeVisible();
      expect(screen.getByRole("button", { name: label })).toBeDisabled();
      expect(screen.getByRole("status")).toHaveTextContent(label);
      expect(detailRequests()).toEqual([`GET /jobs/${jobDetail.id}`]);
      expect(stub?.requests.some((request) => request.method === "post")).toBe(
        false,
      );
    },
  );

  it("shows an existing application from the detail response", async () => {
    mountPage({
      ...jobDetail,
      already_applied: true,
      is_applicable: false,
    });

    expect(
      await screen.findByRole("heading", { name: jobDetail.title, level: 2 }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Já candidatado" }),
    ).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Já candidatado");
    expect(detailRequests()).toEqual([`GET /jobs/${jobDetail.id}`]);
  });
});

describe("Ver a vaga", () => {
  async function openFromApplications(detail: StubResponse["data"]) {
    writeAccessToken("synthetic-access");
    appQueryClient.setDefaultOptions({
      queries: { retry: false },
      mutations: { retry: false },
    });
    stub = stubApiRoutes({
      "GET /auth/me": {
        status: 200,
        data: {
          id: "77777777-7777-4777-8777-777777777777",
          user_type: "candidate",
          company_status: null,
        },
      },
      "GET /notifications/me": {
        status: 200,
        data: { items: [], unread_count: 0, next_cursor: null },
      },
      "GET /applications/me": { status: 200, data: [application] },
      [`GET /jobs/${application.job_id}`]: { status: 200, data: detail },
    });
    const router = createRouter({
      routeTree: routeTree as AnyRoute,
      history: createMemoryHistory({
        initialEntries: ["/candidato/candidaturas"],
      }),
      defaultPreload: false,
    });
    render(
      <QueryClientProvider client={appQueryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    const link = await screen.findByRole("link", { name: /Ver a vaga/ });
    expect(link).toHaveAttribute(
      "href",
      `/candidato/vagas/${application.job_id}`,
    );
    await userEvent.click(link);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(
        `/candidato/vagas/${application.job_id}`,
      );
    });
  }

  it("navigates to the detail route and keeps applying available for an open job", async () => {
    await openFromApplications(jobDetail);

    expect(
      await screen.findByRole("heading", { name: jobDetail.title, level: 2 }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Candidatar-se" })).toBeEnabled();
    expect(detailRequests()).toEqual([`GET /jobs/${jobDetail.id}`]);
  });

  it("navigates to a closed job and blocks applying from the detail status", async () => {
    await openFromApplications({
      ...jobDetail,
      status: "closed",
      is_open: false,
      is_expired: false,
      already_applied: false,
      is_applicable: false,
    });

    expect(
      await screen.findByRole("button", { name: "Vaga encerrada" }),
    ).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Vaga encerrada");
    expect(screen.queryByRole("button", { name: "Candidatar-se" })).toBeNull();
  });

  it("navigates to the detail route and shows that the professional already applied", async () => {
    await openFromApplications({
      ...jobDetail,
      title: jobDetail.title,
      already_applied: true,
      is_applicable: false,
    });

    expect(
      await screen.findByRole("heading", { name: jobDetail.title, level: 2 }),
    ).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Analista", level: 2 }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Já candidatado" }),
    ).toBeDisabled();
    expect(
      stub?.requests.filter((request) => request.url === "/applications/me"),
    ).toHaveLength(1);
  });
});
