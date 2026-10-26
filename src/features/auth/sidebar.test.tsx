import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { queryClient } from "@/lib/query-client";
import { clearSession, writeAccessToken } from "@/lib/session-storage";

import { Sidebar } from "./sidebar";

const navigateMock = vi.fn();
let pathname = "/candidato";

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({
    navigate: navigateMock,
  }),
  useLocation: () => ({ pathname }),
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

describe("Sidebar", () => {
  beforeEach(() => {
    navigateMock.mockClear();
    pathname = "/candidato";
  });

  afterEach(() => {
    clearSession();
    queryClient.clear();
  });

  it("shows the candidate area label", () => {
    render(<Sidebar userType="candidate" />);

    expect(screen.getByText("Seniors")).toBeVisible();
    expect(screen.getByText("Área do candidato")).toBeVisible();
  });

  it("shows the company area label", () => {
    render(<Sidebar userType="company" />);

    expect(screen.getByText("Área da empresa")).toBeVisible();
  });

  it("shows the administrator area label", () => {
    render(<Sidebar userType="administrator" />);

    expect(screen.getByText("Administração")).toBeVisible();
  });

  it("links candidate nav items to their real pages", () => {
    render(<Sidebar userType="candidate" />);

    expect(screen.getByRole("link", { name: "Relatórios" })).toHaveAttribute(
      "href",
      "/candidato",
    );
    expect(screen.getByRole("link", { name: "Vagas" })).toHaveAttribute(
      "href",
      "/candidato/vagas",
    );
    expect(screen.getByRole("link", { name: "Candidaturas" })).toHaveAttribute(
      "href",
      "/candidato/candidaturas",
    );
    expect(screen.getByRole("link", { name: "Meu perfil" })).toHaveAttribute(
      "href",
      "/candidato/perfil",
    );
  });

  it("marks the current page with aria-current", () => {
    pathname = "/candidato/perfil";
    render(<Sidebar userType="candidate" />);

    expect(screen.getByRole("link", { name: "Meu perfil" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("link", { name: "Relatórios" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("shows the remaining candidate nav items as static text, not as controls", () => {
    render(<Sidebar userType="candidate" />);

    ["Capacitação", "Como usar"].forEach((label) => {
      expect(screen.getByText(label)).toBeVisible();
      expect(
        screen.queryByRole("button", { name: label }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: label }),
      ).not.toBeInTheDocument();
    });
  });

  it("links Minhas vagas to the company job list", () => {
    pathname = "/empresa/vagas";
    render(<Sidebar userType="company" />);

    const myJobs = screen.getByRole("link", { name: "Minhas vagas" });
    expect(myJobs).toHaveAttribute("href", "/empresa/vagas");
    expect(myJobs).toHaveAttribute("aria-current", "page");
  });

  it("shows the remaining company nav items as static text", () => {
    render(<Sidebar userType="company" />);

    ["Relatórios", "Perfil"].forEach((label) => {
      expect(screen.getByText(label)).toBeVisible();
      expect(
        screen.queryByRole("link", { name: label }),
      ).not.toBeInTheDocument();
    });
  });

  it("links administrator pages and keeps the remaining items static", () => {
    render(<Sidebar userType="administrator" />);

    expect(screen.getByRole("link", { name: "Candidatos" })).toHaveAttribute(
      "href",
      "/administrador/candidatos",
    );
    expect(screen.getByRole("link", { name: "Cadastros" })).toHaveAttribute(
      "href",
      "/administrador/contas",
    );
    expect(screen.getByRole("link", { name: "Relatórios" })).toHaveAttribute(
      "href",
      "/administrador",
    );
    ["Empresas", "Capacitação"].forEach((label) => {
      expect(screen.getByText(label)).toBeVisible();
      expect(
        screen.queryByRole("link", { name: label }),
      ).not.toBeInTheDocument();
    });
  });

  it("signs out, clears the query cache and navigates back to login", async () => {
    const user = userEvent.setup();
    writeAccessToken("synthetic-token");
    const clearSpy = vi.spyOn(queryClient, "clear");

    render(<Sidebar userType="candidate" />);

    await user.click(screen.getByRole("button", { name: "Sair" }));

    expect(clearSpy).toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith({ href: "/login" });
  });
});
