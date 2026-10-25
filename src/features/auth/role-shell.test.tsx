import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RoleShell } from "./role-shell";

const navigateMock = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({
    navigate: navigateMock,
  }),
  useLocation: () => ({ pathname: "/candidato" }),
  Link: ({
    to,
    children,
    ...props
  }: {
    to: string;
    children: React.ReactNode;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

describe("RoleShell", () => {
  it("shows the header, sidebar and support button for the candidate area", () => {
    render(
      <RoleShell userType="candidate">
        <p>Conteúdo da página</p>
      </RoleShell>,
    );

    expect(screen.getByText("Área do candidato")).toBeVisible();
    expect(screen.getByText("Olá!")).toBeVisible();
    expect(screen.getByText("Conteúdo da página")).toBeVisible();
    expect(screen.getByText("Suporte no WhatsApp")).toBeVisible();
  });

  it("omits the greeting header for the company area", () => {
    render(
      <RoleShell userType="company">
        <p>Conteúdo da página</p>
      </RoleShell>,
    );

    expect(screen.getByText("Área da empresa")).toBeVisible();
    expect(screen.queryByText("Olá!")).not.toBeInTheDocument();
  });

  it("omits the greeting header for the administrator area", () => {
    render(
      <RoleShell userType="administrator">
        <p>Conteúdo da página</p>
      </RoleShell>,
    );

    expect(screen.getByText("Administração")).toBeVisible();
    expect(screen.queryByText("Olá!")).not.toBeInTheDocument();
  });

  it("shows the header with the route's action for the company area", () => {
    render(
      <RoleShell
        userType="company"
        headerAction={<a href="/empresa/notificacoes">Notificações</a>}
      >
        <p>Conteúdo da página</p>
      </RoleShell>,
    );

    expect(screen.getByText("Olá!")).toBeVisible();
    expect(screen.getByRole("link", { name: "Notificações" })).toHaveAttribute(
      "href",
      "/empresa/notificacoes",
    );
  });
});
