import { afterEach, describe, expect, it, vi } from "vitest";

import { type ApiStub, stubApiRoutes } from "../../tests/api-stub";
import { stubDownloads } from "../../tests/download-stub";
import { ApiError } from "./api-error";
import { fetchFile, filenameFrom, saveFile } from "./download-file";

const route = "GET /admin/accounts/export";
let stub: ApiStub | undefined;

afterEach(() => {
  stub?.restore();
  stub = undefined;
  vi.restoreAllMocks();
});

function problem(status: number, code: string): Blob {
  return new Blob([JSON.stringify({ title: "Forbidden", status, code })], {
    type: "application/problem+json",
  });
}

describe("fetchFile", () => {
  it("names the file after Content-Disposition", async () => {
    const csv = new Blob(["Nome;Tipo\r\n"], { type: "text/csv" });
    stub = stubApiRoutes({
      [route]: {
        status: 200,
        data: csv,
        headers: {
          "content-disposition":
            'attachment; filename="cadastros-2026-10-26.csv"',
        },
      },
    });

    const file = await fetchFile("/admin/accounts/export", "cadastros.csv");

    expect(file).toEqual({ blob: csv, filename: "cadastros-2026-10-26.csv" });
  });

  it("falls back to the given name when the header is missing", async () => {
    stub = stubApiRoutes({ [route]: { status: 200, data: new Blob(["x"]) } });

    const file = await fetchFile("/admin/accounts/export", "cadastros.csv");

    expect(file.filename).toBe("cadastros.csv");
  });

  it("reads the problem details that arrive as a Blob", async () => {
    stub = stubApiRoutes({
      [route]: { status: 403, data: problem(403, "administrator_required") },
    });

    const failure = fetchFile("/admin/accounts/export", "cadastros.csv");

    await expect(failure).rejects.toBeInstanceOf(ApiError);
    await expect(failure).rejects.toMatchObject({
      status: 403,
      code: "administrator_required",
    });
  });

  it("keeps the generic error when the error body is not JSON", async () => {
    stub = stubApiRoutes({
      [route]: { status: 502, data: new Blob(["<html>Bad Gateway</html>"]) },
    });

    await expect(
      fetchFile("/admin/accounts/export", "cadastros.csv"),
    ).rejects.toMatchObject({ status: 502, code: undefined });
  });

  it("keeps a network failure as it was mapped", async () => {
    stub = stubApiRoutes({ [route]: { status: 0 } });

    await expect(
      fetchFile("/admin/accounts/export", "cadastros.csv"),
    ).rejects.toMatchObject({ status: undefined });
  });
});

describe("filenameFrom", () => {
  it.each([
    [
      'attachment; filename="relatorios-2026-10-26.csv"',
      "relatorios-2026-10-26.csv",
    ],
    ["attachment; filename=relatorios.csv", "relatorios.csv"],
    ["attachment", undefined],
    [undefined, undefined],
  ])("reads %s", (header, expected) => {
    expect(filenameFrom(header)).toBe(expected);
  });
});

describe("saveFile", () => {
  it("downloads the blob under its name and releases it", () => {
    vi.useFakeTimers();
    const downloads = stubDownloads();
    const blob = new Blob(["Nome\r\n"]);

    try {
      saveFile({ blob, filename: "cadastros.csv" });

      expect(downloads.createObjectURL).toHaveBeenCalledWith(blob);
      expect(downloads.saved).toEqual(["cadastros.csv"]);
      expect(document.querySelector("a[download]")).toBeNull();
      expect(downloads.revokeObjectURL).not.toHaveBeenCalled();
      vi.runAllTimers();
      expect(downloads.revokeObjectURL).toHaveBeenCalledWith("blob:export");
    } finally {
      downloads.restore();
      vi.useRealTimers();
    }
  });
});
