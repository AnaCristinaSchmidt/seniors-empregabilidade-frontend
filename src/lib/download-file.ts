import axios from "axios";

import { apiClient } from "@/lib/api-client";
import { ApiError, toApiError } from "@/lib/api-error";

export interface DownloadedFile {
  blob: Blob;
  filename: string;
}

/**
 * Download a file from the API through `apiClient`, so the bearer token goes
 * with it; a plain link would reach the API unauthenticated. The name comes
 * from `Content-Disposition` and falls back to `fallbackFilename`.
 */
export async function fetchFile(
  path: string,
  fallbackFilename: string,
  signal?: AbortSignal,
): Promise<DownloadedFile> {
  try {
    const response = await apiClient.get<Blob>(path, {
      responseType: "blob",
      headers: { Accept: "text/csv, application/problem+json" },
      ...(signal ? { signal } : {}),
    });
    return {
      blob: response.data,
      filename:
        filenameFrom(response.headers["content-disposition"]) ??
        fallbackFilename,
    };
  } catch (error) {
    throw await withProblemDetails(error);
  }
}

/** Hand a downloaded file to the browser, which saves it as a download. */
export function saveFile(file: DownloadedFile): void {
  const url = URL.createObjectURL(file.blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.filename;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoke after the click has handed the URL to the download.
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}

export function filenameFrom(contentDisposition: unknown): string | undefined {
  if (typeof contentDisposition !== "string") return undefined;
  return /filename="?([^";]+)"?/i.exec(contentDisposition)?.[1];
}

/**
 * With `responseType: "blob"` an RFC 9457 error body also arrives as a Blob, so
 * the shared mapping cannot read its `code`. Read the body and map it again.
 */
async function withProblemDetails(error: unknown): Promise<unknown> {
  if (!(error instanceof ApiError) || !axios.isAxiosError(error.cause)) {
    return error;
  }
  const response = error.cause.response;
  if (!response || !(response.data instanceof Blob)) return error;
  try {
    response.data = JSON.parse(await response.data.text()) as unknown;
  } catch {
    return error;
  }
  return toApiError(error.cause);
}
