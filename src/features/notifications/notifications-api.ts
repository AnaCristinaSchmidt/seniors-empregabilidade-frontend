import { z } from "zod";

import { apiClient } from "@/lib/api-client";
import { toApiError } from "@/lib/api-error";

export const NOTIFICATIONS_PAGE_SIZE = 20;

// Every notification query shares this prefix, so one invalidation refreshes
// both the list and the unread counter in the header.
export const notificationsQueryKey = ["notifications"] as const;

export const notificationSchema = z.object({
  id: z.string().uuid(),
  // A stable event code. Kept as a string: an event the API adds later must
  // not break the whole list.
  type: z.string(),
  message: z.string(),
  details: z.record(z.string(), z.unknown()).nullable(),
  read: z.boolean(),
  created_at: z.string().datetime({ offset: true }),
});

export const notificationPageSchema = z.object({
  items: z.array(notificationSchema),
  unread_count: z.number().int().nonnegative(),
  next_cursor: z.string().nullable(),
});

export type Notification = z.infer<typeof notificationSchema>;
export type NotificationPage = z.infer<typeof notificationPageSchema>;

interface FetchNotificationsParams {
  unreadOnly?: boolean;
  cursor?: string | undefined;
  limit?: number;
  signal?: AbortSignal;
}

export async function fetchNotifications({
  unreadOnly = false,
  cursor,
  limit = NOTIFICATIONS_PAGE_SIZE,
  signal,
}: FetchNotificationsParams = {}): Promise<NotificationPage> {
  try {
    const response = await apiClient.get<unknown>("/notifications/me", {
      params: {
        limit,
        ...(unreadOnly ? { unread_only: true } : {}),
        ...(cursor ? { cursor } : {}),
      },
      ...(signal ? { signal } : {}),
    });
    return notificationPageSchema.parse(response.data);
  } catch (error) {
    throw toApiError(error);
  }
}

/** The header only needs the counter, so it asks for the smallest page. */
export async function fetchUnreadCount(signal?: AbortSignal): Promise<number> {
  const page = await fetchNotifications({
    unreadOnly: true,
    limit: 1,
    ...(signal ? { signal } : {}),
  });
  return page.unread_count;
}

export async function markNotificationAsRead(
  id: string,
): Promise<Notification> {
  try {
    const response = await apiClient.post<unknown>(`/notifications/${id}/read`);
    return notificationSchema.parse(response.data);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function markAllNotificationsAsRead(): Promise<void> {
  try {
    await apiClient.post("/notifications/me/read-all");
  } catch (error) {
    throw toApiError(error);
  }
}
