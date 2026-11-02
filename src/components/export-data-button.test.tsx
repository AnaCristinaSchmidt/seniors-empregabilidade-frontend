import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api-error";
import type { DownloadedFile } from "@/lib/download-file";

import { type DownloadStub, stubDownloads } from "../../tests/download-stub";
import { ExportDataButton } from "./export-data-button";

const file: DownloadedFile = {
  blob: new Blob(["Nome\r\n"]),
  filename: "cadastros.csv",
};
let downloads: DownloadStub;

beforeEach(() => {
  downloads = stubDownloads();
});

afterEach(() => {
  downloads.restore();
});

function mount(onExport: () => Promise<DownloadedFile>) {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { mutations: { retry: false } } })
      }
    >
      <ExportDataButton onExport={onExport} />
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

it("keeps focus while generating and announces the saved file", async () => {
  let finish: (value: DownloadedFile) => void = () => undefined;
  const onExport = vi.fn(
    () =>
      new Promise<DownloadedFile>((resolve) => {
        finish = resolve;
      }),
  );
  const user = mount(onExport);

  await user.click(screen.getByRole("button", { name: "Exportar dados" }));

  const pending = screen.getByRole("button", { name: "Gerando arquivo…" });
  expect(pending).toHaveFocus();
  expect(pending).toHaveAttribute("aria-disabled", "true");
  await user.click(pending);
  expect(onExport).toHaveBeenCalledOnce();

  finish(file);

  expect(await screen.findByRole("status")).toHaveTextContent(
    "Arquivo CSV exportado.",
  );
  expect(downloads.saved).toEqual(["cadastros.csv"]);
  expect(screen.getByRole("button", { name: "Exportar dados" })).toHaveFocus();
});

it("explains a refused export and lets the administrator try again", async () => {
  const onExport = vi
    .fn<() => Promise<DownloadedFile>>()
    .mockRejectedValueOnce(new ApiError({ message: "Forbidden", status: 403 }))
    .mockRejectedValueOnce(
      new ApiError({ message: "Bad Gateway", status: 502 }),
    )
    .mockResolvedValueOnce(file);
  const user = mount(onExport);
  const button = screen.getByRole("button", { name: "Exportar dados" });

  await user.click(button);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Apenas administradores podem exportar os dados.",
  );

  await user.click(button);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Não foi possível exportar os dados. Tente novamente.",
  );
  expect(downloads.saved).toEqual([]);

  await user.click(button);
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Arquivo CSV exportado.",
  );
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
