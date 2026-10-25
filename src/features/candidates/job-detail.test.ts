import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it } from "vitest";

import { stubApi, type ApiStub } from "../../../tests/api-stub";
import { jobDetail } from "../../../tests/job-detail-fixture";

import { fetchJobDetail, jobDetailQueryOptions } from "./job-detail";

let stub: ApiStub | undefined;
afterEach(() => stub?.restore());

describe("fetchJobDetail", () => {
  it("reads the complete detail and forwards cancellation", async () => {
    stub = stubApi(200, jobDetail);
    const signal = new AbortController().signal;
    expect(await fetchJobDetail(jobDetail.id, signal)).toEqual(jobDetail);
    expect(stub.requests[0]?.url).toBe(`/jobs/${jobDetail.id}`);

    const controller = new AbortController();
    controller.abort();
    await expect(
      fetchJobDetail(jobDetail.id, controller.signal),
    ).rejects.toThrow();
    expect(stub.requests).toHaveLength(1);
  });

  it.each(["closed", "paused", "expired"] as const)(
    "accepts a readable %s job without optional metadata",
    async (status) => {
      const detail = {
        ...jobDetail,
        status,
        location: null,
        published_at: null,
        skills: [],
        is_open: false,
        is_applicable: false,
      };
      stub = stubApi(200, detail);
      expect(await fetchJobDetail(jobDetail.id)).toEqual(detail);
    },
  );

  it.each([
    { already_applied: undefined },
    { closing_date: "2026-02-30" },
    { status: "open" },
    { skills: ["Spreadsheets"] },
  ])("rejects malformed detail responses: %j", async (overrides) => {
    stub = stubApi(200, { ...jobDetail, ...overrides });
    await expect(fetchJobDetail(jobDetail.id)).rejects.toMatchObject({
      code: "invalid_job_detail_response",
    });
  });

  it.each([401, 403, 404, 500])("preserves HTTP %s errors", async (status) => {
    stub = stubApi(status, {
      title: "Request failed",
      status,
      code: "job_not_found",
    });
    await expect(fetchJobDetail(jobDetail.id)).rejects.toMatchObject({
      status,
      code: "job_not_found",
    });
  });

  it("uses the query signal to fetch the selected job", async () => {
    stub = stubApi(200, jobDetail);
    const options = jobDetailQueryOptions(jobDetail.id);
    const client = new QueryClient();
    expect(await client.fetchQuery(options)).toEqual(jobDetail);
    client.clear();
  });
});
