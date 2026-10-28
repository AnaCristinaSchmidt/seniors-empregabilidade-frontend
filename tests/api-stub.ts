import type {
  AxiosAdapter,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from "axios";

import { apiClient } from "@/lib/api-client";

export interface RecordedRequest {
  url: string | undefined;
  method: string | undefined;
  params: unknown;
  body: unknown;
  authorization: string | null;
}

export interface ApiStub {
  requests: RecordedRequest[];
  restore: () => void;
}

/** A canned answer; status 0 stands for a request that never got a response. */
export interface StubResponse {
  status: number;
  data?: unknown;
  /** Response headers, lower-case, such as `content-disposition`. */
  headers?: Record<string, string>;
}

export type StubRoute =
  | StubResponse
  | ((request: RecordedRequest) => StubResponse | Promise<StubResponse>);

/**
 * Answer every apiClient call with a canned response, through the real
 * interceptors, so tests exercise the shipped error mapping instead of a double.
 */
export function stubApi(status: number, data: unknown): ApiStub {
  return installAdapter(() => ({ status, data }));
}

/**
 * Answer each apiClient call by "<METHOD> <url>", such as "GET /jobs/me". A
 * route given as a function can change its answer during the test or hold the
 * request pending. A call without a route fails with 404, so a missing stub
 * shows up as a failure instead of a hang.
 */
export function stubApiRoutes(
  routes: Record<string, StubRoute>,
  fallback?: StubRoute,
): ApiStub {
  return installAdapter((request) => {
    const route =
      routes[`${request.method?.toUpperCase() ?? ""} ${request.url ?? ""}`] ??
      fallback;
    if (route === undefined)
      return {
        status: 404,
        data: { title: "Not Found", status: 404, code: "stub_route_missing" },
      };
    return typeof route === "function" ? route(request) : route;
  });
}

function installAdapter(
  respond: (request: RecordedRequest) => StubResponse | Promise<StubResponse>,
): ApiStub {
  const original = apiClient.defaults.adapter;
  const requests: RecordedRequest[] = [];

  const adapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
    const request: RecordedRequest = {
      url: config.url,
      method: config.method,
      params: config.params,
      body:
        typeof config.data === "string"
          ? (JSON.parse(config.data) as unknown)
          : config.data,
      // Absent header reads as undefined; normalise so tests can assert it.
      authorization:
        (config.headers.get("Authorization") as string | undefined) ?? null,
    };
    requests.push(request);

    const { status, data, headers = {} } = await respond(request);

    if (status === 0) {
      throw Object.assign(new Error("stubbed network failure"), {
        isAxiosError: true,
        code: "ERR_NETWORK",
        config,
      });
    }

    const response = {
      data,
      status,
      statusText: "",
      headers,
      config,
    } as AxiosResponse;

    if (status >= 400) {
      throw Object.assign(new Error("stubbed failure"), {
        isAxiosError: true,
        config,
        response,
      });
    }

    return response;
  };

  apiClient.defaults.adapter = adapter;

  return {
    requests,
    restore: () => {
      // The default adapter is an optional property: restoring "undefined"
      // would not typecheck, so put the client back by removing the override.
      if (original === undefined) {
        delete apiClient.defaults.adapter;
      } else {
        apiClient.defaults.adapter = original;
      }
    },
  };
}
