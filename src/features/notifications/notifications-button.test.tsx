import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { stubApiRoutes, type ApiStub } from "../../../tests/api-stub";

import { NotificationsButton } from "./notifications-button";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

let stub: ApiStub | undefined;

afterEach(() => {
  stub?.restore();
  stub = undefined;
});

function renderButton() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <NotificationsButton to="/candidato/notificacoes" />
    </QueryClientProvider>,
  );
  return client;
}

/** Waits for the counter query to settle, so no update lands after the test. */
async function settled(client: QueryClient) {
  await waitFor(() =>
    expect(client.isFetching({ queryKey: ["notifications"] })).toBe(0),
  );
}

function stubUnreadCount(count: number) {
  stub = stubApiRoutes({
    "GET /notifications/me": {
      status: 200,
      data: { items: [], unread_count: count, next_cursor: null },
    },
  });
}

describe("NotificationsButton", () => {
  it("links to the notification center and announces the unread count", async () => {
    stubUnreadCount(3);
    renderButton();

    const link = await screen.findByRole("link", {
      name: "Notificações 3 não lidas",
    });
    expect(link).toHaveAttribute("href", "/candidato/notificacoes");
    expect(link).toHaveTextContent("3");
    // WCAG 2.5.3: no aria-label replaces the text, so what is seen is what is
    // announced (and what a voice command can target).
    expect(link).not.toHaveAttribute("aria-label");
  });

  it("uses the singular for one unread notification", async () => {
    stubUnreadCount(1);
    renderButton();

    expect(
      await screen.findByRole("link", { name: "Notificações 1 não lida" }),
    ).toBeVisible();
  });

  it("caps the counter at 99+ in both the text and the name", async () => {
    stubUnreadCount(150);
    renderButton();

    expect(
      await screen.findByRole("link", { name: "Notificações 99+ não lidas" }),
    ).toHaveTextContent("99+");
  });

  it("shows no counter when everything is read", async () => {
    stubUnreadCount(0);
    const client = renderButton();

    await settled(client);
    expect(stub?.requests).toHaveLength(1);
    expect(
      screen.getByRole("link", { name: "Notificações" }),
    ).toHaveTextContent(/^Notificações$/);
  });

  it("still opens the center when the counter cannot be loaded", async () => {
    stub = stubApiRoutes({ "GET /notifications/me": { status: 0 } });
    const client = renderButton();

    await settled(client);
    expect(stub?.requests).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Notificações" })).toHaveAttribute(
      "href",
      "/candidato/notificacoes",
    );
  });
});
