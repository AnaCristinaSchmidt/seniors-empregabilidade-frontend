import { vi } from "vitest";

export interface DownloadStub {
  /** Each saved file, as the name the browser would save it under. */
  saved: string[];
  createObjectURL: ReturnType<typeof vi.fn>;
  revokeObjectURL: ReturnType<typeof vi.fn>;
  restore: () => void;
}

const OBJECT_URL_METHODS = ["createObjectURL", "revokeObjectURL"] as const;

/**
 * Record browser downloads instead of performing them. jsdom has no object
 * URLs and cannot save files. Only the two static methods are replaced: `URL`
 * itself keeps working for the API client.
 */
export function stubDownloads(): DownloadStub {
  const saved: string[] = [];
  const originals = OBJECT_URL_METHODS.map(
    (name) => [name, Object.getOwnPropertyDescriptor(URL, name)] as const,
  );
  const createObjectURL = vi.fn(() => "blob:export");
  const revokeObjectURL = vi.fn();
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    writable: true,
    value: createObjectURL,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    writable: true,
    value: revokeObjectURL,
  });
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(function (this: HTMLAnchorElement) {
      saved.push(this.download);
    });

  return {
    saved,
    createObjectURL,
    revokeObjectURL,
    restore: () => {
      for (const [name, descriptor] of originals) {
        if (descriptor) Object.defineProperty(URL, name, descriptor);
        else Reflect.deleteProperty(URL, name);
      }
      click.mockRestore();
    },
  };
}
