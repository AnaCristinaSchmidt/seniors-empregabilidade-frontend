import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RoleHeader } from "./role-header";

describe("RoleHeader", () => {
  it("shows the greeting", () => {
    render(<RoleHeader />);

    expect(screen.getByText("Olá!")).toBeVisible();
  });

  it("renders the action supplied by the route", () => {
    render(
      <RoleHeader action={<button type="button">Ação do cabeçalho</button>} />,
    );

    expect(
      screen.getByRole("button", { name: "Ação do cabeçalho" }),
    ).toBeVisible();
  });
});
