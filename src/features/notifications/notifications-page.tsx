import { useEffect, useId, useRef, useState, type RefObject } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import {
  fetchNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  notificationsQueryKey,
  type Notification,
} from "./notifications-api";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

function unreadSummary(count: number): string {
  if (count === 0) return "Nenhuma notificação não lida.";
  if (count === 1) return "Você tem 1 notificação não lida.";
  return `Você tem ${count} notificações não lidas.`;
}

interface PendingFocus {
  /** A notification that stays on screen, such as the one just marked read. */
  id?: string;
  /** A list position, such as the first item of a page still loading. */
  index?: number;
}

function moveFocus(
  pending: RefObject<PendingFocus | null>,
  listedIds: string[],
  items: RefObject<Map<string, HTMLLIElement>>,
  heading: RefObject<HTMLHeadingElement | null>,
) {
  const target = pending.current;
  if (target === null) return;
  pending.current = null;
  const id = target.index === undefined ? target.id : listedIds[target.index];
  // The item may have left the list (for example under "Não lidas"), and a
  // disabled or removed button drops focus, so fall back to the page title.
  const item = id ? items.current.get(id) : undefined;
  (item ?? heading.current)?.focus();
}

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const itemRefs = useRef(new Map<string, HTMLLIElement>());
  // Focus moves only after the refreshed list is on screen; moving it earlier
  // would land on an item that is about to be removed.
  const pendingFocusRef = useRef<PendingFocus | null>(null);

  const notifications = useInfiniteQuery({
    queryKey: [...notificationsQueryKey, "list", { unreadOnly }],
    queryFn: ({ pageParam, signal }) =>
      fetchNotifications({ unreadOnly, cursor: pageParam, signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    retry: false,
  });

  const items = notifications.data?.pages.flatMap((page) => page.items) ?? [];
  const unreadCount = notifications.data?.pages.at(-1)?.unread_count ?? 0;

  useEffect(() => {
    const listedIds =
      notifications.data?.pages.flatMap((page) =>
        page.items.map((item) => item.id),
      ) ?? [];
    moveFocus(pendingFocusRef, listedIds, itemRefs, headingRef);
  }, [notifications.data]);

  async function loadMore() {
    // The button leaves the page once the last page arrives, so focus the
    // first new item instead of dropping to the document body.
    pendingFocusRef.current = { index: items.length };
    const result = await notifications.fetchNextPage();
    if (result.isError) pendingFocusRef.current = null;
  }

  async function refreshThenFocus(target: PendingFocus) {
    // Consumed by the effect above once the refreshed list renders. Not here:
    // the query resolves before React draws the new data. A successful change
    // always alters the list (an item turns read or leaves the filter).
    pendingFocusRef.current = target;
    await queryClient.invalidateQueries({ queryKey: notificationsQueryKey });
  }

  const markOne = useMutation({
    mutationFn: markNotificationAsRead,
    onMutate: () => {
      setNotice("");
      setActionError("");
    },
    onSuccess: async (updated) => {
      setNotice("Notificação marcada como lida.");
      await refreshThenFocus({ id: updated.id });
    },
    onError: async () => {
      setActionError(
        "Não foi possível marcar a notificação como lida. Tente novamente.",
      );
      // The server may have applied the change before the response was lost.
      await queryClient.invalidateQueries({ queryKey: notificationsQueryKey });
    },
  });

  const markAll = useMutation({
    mutationFn: markAllNotificationsAsRead,
    onMutate: () => {
      setNotice("");
      setActionError("");
    },
    onSuccess: async () => {
      setNotice("Todas as notificações foram marcadas como lidas.");
      await refreshThenFocus({});
    },
    onError: async () => {
      setActionError(
        "Não foi possível marcar as notificações como lidas. Tente novamente.",
      );
      await queryClient.invalidateQueries({ queryKey: notificationsQueryKey });
    },
  });

  const isBusy = markOne.isPending || markAll.isPending;

  function changeFilter(next: boolean) {
    // The status and alert messages describe the last action, not the current
    // list, so a filter change must retire them from the live regions.
    setNotice("");
    setActionError("");
    setUnreadOnly(next);
  }

  return (
    <div className="space-y-6 bg-background p-4 md:p-8">
      <div className="space-y-2">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-3xl font-bold text-foreground focus-visible:outline-none"
        >
          Notificações
        </h1>
        {notifications.isSuccess ? (
          <p className="text-lg text-muted-foreground">
            {unreadSummary(unreadCount)}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div
          role="group"
          aria-label="Filtrar notificações"
          className="flex gap-2"
        >
          <Button
            variant={unreadOnly ? "outline" : "default"}
            aria-pressed={!unreadOnly}
            onClick={() => changeFilter(false)}
          >
            Todas
          </Button>
          <Button
            variant={unreadOnly ? "default" : "outline"}
            aria-pressed={unreadOnly}
            onClick={() => changeFilter(true)}
          >
            Não lidas
          </Button>
        </div>

        <Button
          variant="outline"
          disabled={unreadCount === 0 || isBusy}
          onClick={() => markAll.mutate()}
        >
          Marcar todas como lidas
        </Button>
      </div>

      <p role="status" className="text-base">
        {notice}
      </p>
      {actionError ? (
        <p
          role="alert"
          className="rounded-md border border-destructive bg-background p-4 text-base text-destructive"
        >
          {actionError}
        </p>
      ) : null}

      {notifications.isPending ? (
        <div role="status" className="space-y-4">
          <span className="sr-only">Carregando notificações…</span>
          <Skeleton className="h-28 w-full rounded-lg" />
          <Skeleton className="h-28 w-full rounded-lg" />
        </div>
      ) : null}

      {/* Only when nothing loaded: a failed "Carregar mais" also flags the
          query as errored, but keeps the pages already on screen. */}
      {notifications.isLoadingError ? (
        <div
          role="alert"
          className="space-y-3 rounded-md border border-destructive bg-background p-4 text-base text-destructive"
        >
          <p>Não foi possível carregar suas notificações.</p>
          <Button
            variant="outline"
            disabled={notifications.isFetching}
            onClick={() => void notifications.refetch()}
          >
            Tentar novamente
          </Button>
        </div>
      ) : null}

      {notifications.isSuccess && items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-lg text-muted-foreground">
          {unreadOnly
            ? "Você não tem notificações não lidas."
            : "Você ainda não tem notificações."}
        </p>
      ) : null}

      {items.length > 0 ? (
        <ul className="space-y-4">
          {items.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              disabled={isBusy}
              onMarkAsRead={() => markOne.mutate(notification.id)}
              itemRef={(element) => {
                if (element) itemRefs.current.set(notification.id, element);
                else itemRefs.current.delete(notification.id);
              }}
            />
          ))}
        </ul>
      ) : null}

      {notifications.hasNextPage ? (
        <Button
          variant="outline"
          disabled={notifications.isFetchingNextPage}
          onClick={() => void loadMore()}
        >
          {notifications.isFetchingNextPage ? "Carregando…" : "Carregar mais"}
        </Button>
      ) : null}

      {notifications.isFetchNextPageError ? (
        <p role="alert" className="text-base text-destructive">
          Não foi possível carregar mais notificações. Tente novamente.
        </p>
      ) : null}
    </div>
  );
}

interface NotificationItemProps {
  notification: Notification;
  disabled: boolean;
  onMarkAsRead: () => void;
  itemRef: (element: HTMLLIElement | null) => void;
}

function NotificationItem({
  notification,
  disabled,
  onMarkAsRead,
  itemRef,
}: NotificationItemProps) {
  const messageId = useId();
  const createdAt = new Date(notification.created_at);

  return (
    <li
      ref={itemRef}
      tabIndex={-1}
      className={cn(
        "space-y-3 rounded-lg border p-5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        notification.read
          ? "border-border bg-background"
          : "border-primary bg-accent",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* The state is written out, never conveyed by color alone. */}
        <span
          className={cn(
            "text-base font-semibold",
            notification.read ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {notification.read ? "Lida" : "Não lida"}
        </span>
        <time
          dateTime={notification.created_at}
          className="text-base text-muted-foreground"
        >
          {dateFormatter.format(createdAt)}
        </time>
      </div>

      <p id={messageId} className="text-lg text-foreground">
        {notification.message}
      </p>

      {notification.read ? null : (
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          aria-describedby={messageId}
          onClick={onMarkAsRead}
        >
          Marcar como lida
        </Button>
      )}
    </li>
  );
}
