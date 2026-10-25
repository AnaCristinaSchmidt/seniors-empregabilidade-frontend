import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it } from "vitest";

import {
  stubApiRoutes,
  type ApiStub,
  type RecordedRequest,
  type StubResponse,
} from "../../../tests/api-stub";

import type { Notification } from "./notifications-api";
import NotificationsPage from "./notifications-page";

function makeNotification(
  index: number,
  overrides: Partial<Notification> = {},
): Notification {
  return {
    id: `10000000-0000-4000-8000-00000000000${index}`,
    type: "application_status_changed",
    message: `Notificação sintética ${index}`,
    details: null,
    read: false,
    // Newest first: a smaller index is a more recent notification.
    created_at: `2026-10-1${9 - index}T15:00:00Z`,
    ...overrides,
  };
}

/** Answers like the API: newest first, keyed by cursor, honoring the filter. */
function fakeServer(initial: Notification[], pageSize = 20) {
  const store = initial.map((item) => ({ ...item }));

  function list(request: RecordedRequest): StubResponse {
    const params = (request.params ?? {}) as {
      limit?: number;
      unread_only?: boolean;
      cursor?: string;
    };
    // The server caps the page, like the API's own page size.
    const limit = Math.min(params.limit ?? pageSize, pageSize);
    const visible = store.filter((item) => !params.unread_only || !item.read);
    const start = params.cursor ? Number(params.cursor) : 0;
    const items = visible.slice(start, start + limit);
    const next = start + limit < visible.length ? String(start + limit) : null;
    return {
      status: 200,
      data: {
        items,
        unread_count: store.filter((item) => !item.read).length,
        next_cursor: next,
      },
    };
  }

  const routes: Record<string, (request: RecordedRequest) => StubResponse> = {
    "GET /notifications/me": list,
    "POST /notifications/me/read-all": () => {
      store.forEach((item) => (item.read = true));
      return { status: 204 };
    },
  };
  for (const item of store) {
    routes[`POST /notifications/${item.id}/read`] = () => {
      item.read = true;
      return { status: 200, data: item };
    };
  }
  return routes;
}

let stub: ApiStub | undefined;

afterEach(() => {
  stub?.restore();
  stub = undefined;
});

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <NotificationsPage />
    </QueryClientProvider>,
  );
}

function listRequests() {
  return (stub?.requests ?? []).filter((request) => request.method === "get");
}

describe("NotificationsPage", () => {
  it("lists notifications newest first with their state and date", async () => {
    stub = stubApiRoutes(
      fakeServer([makeNotification(1), makeNotification(2, { read: true })]),
    );
    renderPage();

    const items = await screen.findAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(
      within(items[0]!).getByText("Notificação sintética 1"),
    ).toBeVisible();
    expect(within(items[0]!).getByText("Não lida")).toBeVisible();
    expect(within(items[0]!).getByText("18/10/2026, 12:00")).toBeVisible();
    expect(within(items[1]!).getByText("Lida")).toBeVisible();
    expect(
      within(items[1]!).queryByRole("button", { name: "Marcar como lida" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Você tem 1 notificação não lida.")).toBeVisible();
  });

  it("explains when there is nothing to show", async () => {
    stub = stubApiRoutes(fakeServer([makeNotification(1, { read: true })]));
    renderPage();
    const user = userEvent.setup();

    await screen.findByText("Nenhuma notificação não lida.");
    await user.click(screen.getByRole("button", { name: "Não lidas" }));

    expect(
      await screen.findByText("Você não tem notificações não lidas."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Não lidas" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(listRequests().at(-1)?.params).toMatchObject({ unread_only: true });
  });

  it("shows an empty center for a new account", async () => {
    stub = stubApiRoutes(fakeServer([]));
    renderPage();

    expect(
      await screen.findByText("Você ainda não tem notificações."),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Marcar todas como lidas" }),
    ).toBeDisabled();
  });

  it("announces the initial load to screen readers", async () => {
    stub = stubApiRoutes(fakeServer([makeNotification(1)]));
    renderPage();

    // Announced through its text, not only an aria-label.
    expect(
      screen.getByText("Carregando notificações…").closest('[role="status"]'),
    ).toBeInTheDocument();
    await screen.findByText("Notificação sintética 1");
  });

  it("reports a failed load and lets the person try again", async () => {
    let fail = true;
    const list = fakeServer([makeNotification(1)])["GET /notifications/me"]!;
    stub = stubApiRoutes({
      "GET /notifications/me": (request) =>
        fail ? { status: 0 } : list(request),
    });
    renderPage();
    const user = userEvent.setup();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar suas notificações.",
    );

    fail = false;
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));

    expect(await screen.findByText("Notificação sintética 1")).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("loads the next page through the cursor", async () => {
    stub = stubApiRoutes(
      fakeServer(
        [1, 2, 3].map((index) => makeNotification(index)),
        2,
      ),
    );
    renderPage();
    const user = userEvent.setup();

    await screen.findByText("Notificação sintética 1");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Carregar mais" }));

    expect(await screen.findByText("Notificação sintética 3")).toBeVisible();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(listRequests().at(-1)?.params).toMatchObject({ cursor: "2" });
    expect(
      screen.queryByRole("button", { name: "Carregar mais" }),
    ).not.toBeInTheDocument();
    // The button left the page, so focus lands on the first new item.
    await waitFor(() =>
      expect(screen.getAllByRole("listitem")[2]).toHaveFocus(),
    );
  });

  it("keeps the next page reachable when loading it fails", async () => {
    const routes = fakeServer(
      [1, 2, 3].map((index) => makeNotification(index)),
      2,
    );
    const list = routes["GET /notifications/me"]!;
    routes["GET /notifications/me"] = (request) =>
      (request.params as { cursor?: string }).cursor
        ? { status: 0 }
        : list(request);
    stub = stubApiRoutes(routes);
    renderPage();
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", { name: "Carregar mais" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar mais notificações.",
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Carregar mais" })).toBeEnabled();
  });

  it("marks one notification as read and keeps focus on it", async () => {
    stub = stubApiRoutes(
      fakeServer([makeNotification(1), makeNotification(2)]),
    );
    renderPage();
    const user = userEvent.setup();

    const [first] = await screen.findAllByRole("listitem");
    await user.click(
      within(first!).getByRole("button", { name: "Marcar como lida" }),
    );

    expect(
      await screen.findByText("Notificação marcada como lida."),
    ).toBeVisible();
    await waitFor(() =>
      expect(screen.getAllByRole("listitem")[0]).toHaveFocus(),
    );
    expect(
      within(screen.getAllByRole("listitem")[0]!).getByText("Lida"),
    ).toBeVisible();
    expect(screen.getByText("Você tem 1 notificação não lida.")).toBeVisible();
  });

  it("clears the status message when the filter changes", async () => {
    stub = stubApiRoutes(
      fakeServer([makeNotification(1), makeNotification(2)]),
    );
    renderPage();
    const user = userEvent.setup();

    const [first] = await screen.findAllByRole("listitem");
    await user.click(
      within(first!).getByRole("button", { name: "Marcar como lida" }),
    );
    expect(
      await screen.findByText("Notificação marcada como lida."),
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Não lidas" }));

    await waitFor(() =>
      expect(
        screen.queryByText("Notificação marcada como lida."),
      ).not.toBeInTheDocument(),
    );
  });

  it("moves focus to the title when the read item leaves the unread list", async () => {
    stub = stubApiRoutes(
      fakeServer([makeNotification(1), makeNotification(2)]),
    );
    renderPage();
    const user = userEvent.setup();

    await screen.findByText("Notificação sintética 1");
    await user.click(screen.getByRole("button", { name: "Não lidas" }));
    await waitFor(() =>
      expect(listRequests().at(-1)?.params).toMatchObject({
        unread_only: true,
      }),
    );
    const [first] = await screen.findAllByRole("listitem");
    await user.click(
      within(first!).getByRole("button", { name: "Marcar como lida" }),
    );

    await waitFor(() =>
      expect(
        screen.queryByText("Notificação sintética 1"),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("heading", { name: "Notificações" })).toHaveFocus();
  });

  it("marks every notification as read", async () => {
    stub = stubApiRoutes(
      fakeServer([makeNotification(1), makeNotification(2)]),
    );
    renderPage();
    const user = userEvent.setup();

    await screen.findByText("Você tem 2 notificações não lidas.");
    await user.click(
      screen.getByRole("button", { name: "Marcar todas como lidas" }),
    );

    expect(
      await screen.findByText(
        "Todas as notificações foram marcadas como lidas.",
      ),
    ).toBeVisible();
    expect(screen.getByText("Nenhuma notificação não lida.")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Marcar todas como lidas" }),
    ).toBeDisabled();
    expect(screen.getByRole("heading", { name: "Notificações" })).toHaveFocus();
  });

  it("reports a failure to mark as read", async () => {
    const routes = fakeServer([makeNotification(1)]);
    routes[`POST /notifications/${makeNotification(1).id}/read`] = () => ({
      status: 0,
    });
    stub = stubApiRoutes(routes);
    renderPage();
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", { name: "Marcar como lida" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível marcar a notificação como lida.",
    );
  });

  it("reports a failure to mark everything as read", async () => {
    const routes = fakeServer([makeNotification(1)]);
    routes["POST /notifications/me/read-all"] = () => ({ status: 0 });
    stub = stubApiRoutes(routes);
    renderPage();
    const user = userEvent.setup();

    await screen.findByText("Você tem 1 notificação não lida.");
    await user.click(
      screen.getByRole("button", { name: "Marcar todas como lidas" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível marcar as notificações como lidas.",
    );
  });
});
