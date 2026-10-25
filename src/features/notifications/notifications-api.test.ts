import { afterEach, describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api-error";
import { stubApiRoutes, type ApiStub } from "../../../tests/api-stub";

import {
  fetchNotifications,
  fetchUnreadCount,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  type Notification,
} from "./notifications-api";

const notification: Notification = {
  id: "10000000-0000-4000-8000-000000000001",
  type: "application_received",
  message: "Nova candidatura para a vaga Analista.",
  details: { application_id: "20000000-0000-4000-8000-000000000001" },
  read: false,
  created_at: "2026-10-14T21:30:00Z",
};

let stub: ApiStub | undefined;

afterEach(() => {
  stub?.restore();
  stub = undefined;
});

describe("fetchNotifications", () => {
  it("asks for the first page with the default size", async () => {
    stub = stubApiRoutes({
      "GET /notifications/me": {
        status: 200,
        data: { items: [notification], unread_count: 1, next_cursor: null },
      },
    });

    const page = await fetchNotifications();

    expect(page.items).toEqual([notification]);
    expect(page.unread_count).toBe(1);
    expect(page.next_cursor).toBeNull();
    expect(stub.requests[0]?.params).toEqual({ limit: 20 });
  });

  it("sends the cursor and the unread filter", async () => {
    stub = stubApiRoutes({
      "GET /notifications/me": {
        status: 200,
        data: { items: [], unread_count: 0, next_cursor: null },
      },
    });

    await fetchNotifications({ unreadOnly: true, cursor: "opaque-cursor" });

    expect(stub.requests[0]?.params).toEqual({
      limit: 20,
      unread_only: true,
      cursor: "opaque-cursor",
    });
  });

  it("rejects an unexpected payload as an ApiError", async () => {
    stub = stubApiRoutes({
      "GET /notifications/me": { status: 200, data: { items: "nope" } },
    });

    await expect(fetchNotifications()).rejects.toBeInstanceOf(ApiError);
  });

  it("maps an invalid cursor to an ApiError with the API code", async () => {
    stub = stubApiRoutes({
      "GET /notifications/me": {
        status: 422,
        data: {
          title: "Validation Error",
          status: 422,
          code: "invalid_cursor",
        },
      },
    });

    await expect(fetchNotifications({ cursor: "bad" })).rejects.toMatchObject({
      status: 422,
      code: "invalid_cursor",
    });
  });
});

describe("fetchUnreadCount", () => {
  it("reads the counter from the smallest unread page", async () => {
    stub = stubApiRoutes({
      "GET /notifications/me": {
        status: 200,
        data: { items: [notification], unread_count: 7, next_cursor: "next" },
      },
    });

    await expect(fetchUnreadCount()).resolves.toBe(7);
    expect(stub.requests[0]?.params).toEqual({ limit: 1, unread_only: true });
  });
});

describe("markNotificationAsRead", () => {
  it("posts to the notification and returns it read", async () => {
    stub = stubApiRoutes({
      [`POST /notifications/${notification.id}/read`]: {
        status: 200,
        data: { ...notification, read: true },
      },
    });

    const updated = await markNotificationAsRead(notification.id);

    expect(updated.read).toBe(true);
    expect(stub.requests).toHaveLength(1);
  });

  it("maps a missing notification to an ApiError", async () => {
    stub = stubApiRoutes({
      [`POST /notifications/${notification.id}/read`]: {
        status: 404,
        data: {
          title: "Not Found",
          status: 404,
          code: "notification_not_found",
        },
      },
    });

    await expect(markNotificationAsRead(notification.id)).rejects.toMatchObject(
      { status: 404, code: "notification_not_found" },
    );
  });
});

describe("markAllNotificationsAsRead", () => {
  it("posts to read-all", async () => {
    stub = stubApiRoutes({
      "POST /notifications/me/read-all": { status: 204 },
    });

    await markAllNotificationsAsRead();

    expect(stub.requests.map((request) => request.method)).toEqual(["post"]);
  });

  it("maps a failure to an ApiError", async () => {
    stub = stubApiRoutes({ "POST /notifications/me/read-all": { status: 0 } });

    await expect(markAllNotificationsAsRead()).rejects.toBeInstanceOf(ApiError);
  });
});
