import { createFileRoute } from "@tanstack/react-router";

import NotificationsPage from "@/features/notifications/notifications-page";

export const Route = createFileRoute("/candidato/notificacoes")({
  component: NotificationsPage,
});
