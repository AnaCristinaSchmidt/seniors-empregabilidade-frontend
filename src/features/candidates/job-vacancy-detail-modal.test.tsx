import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  stubApiRoutes,
  type ApiStub,
  type StubResponse,
} from "../../../tests/api-stub";
import { jobDetail } from "../../../tests/job-detail-fixture";

import { jobDetailQueryKey } from "./job-detail";
import type { JobDetail } from "./job-detail-schema";
import { JobVacancyDetailModal } from "./job-vacancy-detail-modal";

let stub: ApiStub;
let detailResponse: StubResponse;
let applicationResponse: () => StubResponse | Promise<StubResponse>;
let detailReply: () => StubResponse | Promise<StubResponse>;
const applicationPath = `POST /job-postings/${jobDetail.id}/applications`;

beforeEach(() => {
  detailResponse = { status: 200, data: jobDetail };
  detailReply = () => detailResponse;
  applicationResponse = () => {
    detailResponse = {
      status: 200,
      data: { ...jobDetail, already_applied: true, is_applicable: false },
    };
    return {
      status: 201,
      data: { id: "55555555-5555-4555-8555-555555555555" },
    };
  };
  stub = stubApiRoutes({
    [`GET /jobs/${jobDetail.id}`]: () => detailReply(),
    [applicationPath]: () => applicationResponse(),
  });
});

afterEach(() => stub.restore());

function mount(
  overrides: Partial<ComponentProps<typeof JobVacancyDetailModal>> = {},
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const onOpenChange = vi.fn();
  const props = { jobId: jobDetail.id, open: true, onOpenChange, ...overrides };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const view = render(<JobVacancyDetailModal {...props} />, { wrapper });
  return {
    client,
    onOpenChange,
    ...view,
    update: (changes: Partial<typeof props>) =>
      view.rerender(<JobVacancyDetailModal {...props} {...changes} />),
  };
}

async function loaded() {
  return screen.findByRole("heading", { name: jobDetail.title });
}

function problem(status: number, code: string): StubResponse {
  return {
    status,
    data: {
      title: "Request failed",
      status,
      code,
      detail: "Internal details must not be displayed",
    },
  };
}

describe("JobVacancyDetailModal", () => {
  it("shows authoritative details and every skill separately from compatibility", async () => {
    mount({
      salaryMax: 8000,
      matchSummary: {
        matchedCount: 1,
        requiredCount: 2,
        missingNames: ["Teamwork"],
      },
    });
    await loaded();
    expect(screen.getByText(jobDetail.company_name)).toBeVisible();
    expect(screen.getByText(jobDetail.description)).toBeVisible();
    expect(screen.getByText(/Example City.*Híbrido.*até R\$/)).toBeVisible();
    const skills = screen.getByRole("heading", {
      name: "Requisitos e competências",
    }).parentElement!;
    expect(within(skills).getAllByRole("listitem")).toHaveLength(2);
    expect(within(skills).getByText("Spreadsheets")).toBeVisible();
    expect(within(skills).getByText("Teamwork")).toBeVisible();
    expect(screen.getByText("Você atende 1 de 2 requisitos")).toBeVisible();
    expect(screen.getByText("31/12/2026")).toHaveAttribute(
      "datetime",
      "2026-12-31",
    );
    expect(screen.getByRole("button", { name: "Candidatar-se" })).toBeEnabled();
  });

  it.each([
    [{ already_applied: true }, "Já candidatado"],
    [{ status: "closed", is_open: false }, "Vaga encerrada"],
    [{ status: "paused", is_open: false }, "Vaga pausada"],
    [{ status: "expired", is_open: false, is_expired: true }, "Vaga expirada"],
    [
      { status: "published", is_open: false, is_expired: true },
      "Vaga expirada",
    ],
    [{}, "Candidatura indisponível"],
  ] as const)(
    "disables applying for server state %j",
    async (overrides, label) => {
      detailResponse = {
        status: 200,
        data: { ...jobDetail, ...overrides, is_applicable: false },
      };
      mount();
      await loaded();
      expect(screen.getByRole("button", { name: label })).toBeDisabled();
      expect(screen.getByRole("status")).toHaveTextContent(label);
      expect(stub.requests.every((request) => request.method === "get")).toBe(
        true,
      );
    },
  );

  it("announces loading and disables applying before the detail arrives", async () => {
    let resolve!: (response: StubResponse) => void;
    detailReply = () =>
      new Promise((complete) => {
        resolve = complete;
      });
    mount();
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Carregando detalhes da vaga",
    );
    expect(
      screen.getByRole("button", { name: "Candidatar-se" }),
    ).toBeDisabled();
    resolve(detailResponse);
    await loaded();
    expect(screen.getByRole("button", { name: "Candidatar-se" })).toBeEnabled();
  });

  it("shows a safe error and can retry a failed detail request", async () => {
    detailResponse = problem(500, "internal_error");
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar os detalhes da vaga",
    );
    expect(screen.queryByText(/Internal details/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Candidatar-se" }),
    ).toBeDisabled();
    detailResponse = { status: 200, data: jobDetail };
    await userEvent.click(
      screen.getByRole("button", { name: "Tentar novamente" }),
    );
    await loaded();
    expect(screen.getByRole("button", { name: "Candidatar-se" })).toBeEnabled();
  });

  it("explains unavailable jobs without offering an application or retry", async () => {
    detailResponse = problem(404, "job_not_found");
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Esta vaga não está disponível.",
    );
    expect(
      screen.queryByRole("button", { name: "Tentar novamente" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Candidatar-se" }),
    ).toBeDisabled();
  });

  it("does not enable applying when detail validation fails", async () => {
    detailResponse = {
      status: 200,
      data: { ...jobDetail, is_applicable: undefined },
    };
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar",
    );
    expect(
      screen.getByRole("button", { name: "Candidatar-se" }),
    ).toBeDisabled();
  });

  it("keeps success in the detail cache and invalidates application data", async () => {
    const { client, update } = mount();
    client.setQueryData(["applications", ""], []);
    await loaded();
    await userEvent.click(
      screen.getByRole("button", { name: "Candidatar-se" }),
    );
    expect(await screen.findByText("Candidatura enviada")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Já candidatado" }),
    ).toBeDisabled();
    expect(client.getQueryData(jobDetailQueryKey(jobDetail.id))).toMatchObject({
      already_applied: true,
      is_applicable: false,
    });
    expect(client.getQueryState(["applications", ""])?.isInvalidated).toBe(
      true,
    );
    update({ open: false });
    update({ open: true });
    await loaded();
    await waitFor(() =>
      expect(
        stub.requests.filter((request) => request.method === "get"),
      ).toHaveLength(2),
    );
    expect(
      screen.getByRole("button", { name: "Já candidatado" }),
    ).toBeDisabled();
    expect(screen.queryByText("Candidatura enviada")).not.toBeInTheDocument();
  });

  it("prevents repeated submission while applying", async () => {
    let resolve!: (response: StubResponse) => void;
    applicationResponse = () =>
      new Promise((complete) => {
        resolve = complete;
      });
    mount();
    await loaded();
    await userEvent.click(
      screen.getByRole("button", { name: "Candidatar-se" }),
    );
    expect(
      screen.getByRole("button", { name: "Enviando candidatura…" }),
    ).toBeDisabled();
    resolve({
      status: 201,
      data: { id: "55555555-5555-4555-8555-555555555555" },
    });
    expect(await screen.findByText("Candidatura enviada")).toBeVisible();
    expect(
      stub.requests.filter((request) => request.method === "post"),
    ).toHaveLength(1);
  });

  it("shows a safe application failure and allows another attempt", async () => {
    applicationResponse = () => problem(500, "internal_error");
    mount();
    await loaded();
    await userEvent.click(
      screen.getByRole("button", { name: "Candidatar-se" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível enviar a candidatura",
    );
    expect(screen.queryByText(/Internal details/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Candidatar-se" })).toBeEnabled();
  });

  it.each([
    ["already_applied", { already_applied: true }, "Já candidatado"],
    ["job_closed", { status: "closed", is_open: false }, "Vaga encerrada"],
  ] as const)(
    "refreshes details after %s instead of keeping an actionable stale button",
    async (code, overrides, label) => {
      applicationResponse = () => {
        detailResponse = {
          status: 200,
          data: { ...jobDetail, ...overrides, is_applicable: false },
        };
        return problem(409, code);
      };
      mount();
      await loaded();
      await userEvent.click(
        screen.getByRole("button", { name: "Candidatar-se" }),
      );
      expect(await screen.findByRole("button", { name: label })).toBeDisabled();
      expect(await screen.findByRole("alert")).toBeVisible();
    },
  );

  it("announces a job removed during submission without a dangling error description", async () => {
    applicationResponse = () => {
      detailResponse = problem(404, "job_not_found");
      return problem(404, "job_not_found");
    };
    mount();
    await loaded();
    await userEvent.click(
      screen.getByRole("button", { name: "Candidatar-se" }),
    );
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Esta vaga não está disponível.");
    const button = screen.getByRole("button", { name: "Candidatar-se" });
    await waitFor(() =>
      expect(button).toHaveAttribute("aria-describedby", alert.id),
    );
    expect(button).toBeDisabled();
  });

  it("handles missing optional metadata and an empty description and skills", async () => {
    detailResponse = {
      status: 200,
      data: {
        ...jobDetail,
        location: null,
        published_at: null,
        skills: [],
        description: " ",
      },
    };
    mount();
    await loaded();
    expect(screen.getByText("Descrição não informada.")).toBeVisible();
    expect(
      screen.getByText("Esta vaga ainda não listou requisitos de habilidades."),
    ).toBeVisible();
    expect(screen.queryByText("Como você se encaixa")).not.toBeInTheDocument();
  });

  it("keeps applying disabled while refreshing existing data", async () => {
    const { client } = mount();
    await loaded();
    let resolve!: (response: StubResponse) => void;
    detailReply = () =>
      new Promise((complete) => {
        resolve = complete;
      });
    act(() => {
      void client.invalidateQueries({
        queryKey: jobDetailQueryKey(jobDetail.id),
      });
    });
    await screen.findByText("Atualizando detalhes da vaga…");
    expect(
      screen.getByRole("button", { name: "Candidatar-se" }),
    ).toBeDisabled();
    resolve(detailResponse);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Candidatar-se" }),
      ).toBeEnabled(),
    );
  });

  it("does not carry a late application result into another vacancy", async () => {
    let resolve!: (response: StubResponse) => void;
    applicationResponse = () =>
      new Promise((complete) => {
        resolve = complete;
      });
    const { update } = mount();
    await loaded();
    await userEvent.click(
      screen.getByRole("button", { name: "Candidatar-se" }),
    );
    const otherJob: JobDetail = {
      ...jobDetail,
      id: "66666666-6666-4666-8666-666666666666",
      title: "Other vacancy",
    };
    stub.restore();
    stub = stubApiRoutes({
      [`GET /jobs/${otherJob.id}`]: { status: 200, data: otherJob },
    });
    update({ jobId: otherJob.id });
    await screen.findByRole("heading", { name: otherJob.title });
    await act(async () => {
      resolve({
        status: 201,
        data: { id: "55555555-5555-4555-8555-555555555555" },
      });
      await Promise.resolve();
    });
    expect(screen.queryByText("Candidatura enviada")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Candidatar-se" })).toBeEnabled();
  });

  it("closes with Escape without submitting", async () => {
    const { onOpenChange } = mount();
    await loaded();
    await userEvent.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false, expect.anything());
    expect(stub.requests).toHaveLength(1);
  });

  it("does not fetch while the modal is closed", () => {
    mount({ open: false });
    expect(stub.requests).toHaveLength(0);
  });
});
