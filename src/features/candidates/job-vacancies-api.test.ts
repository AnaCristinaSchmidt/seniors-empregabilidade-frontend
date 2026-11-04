import { describe, expect, it, vi } from "vitest";

import { apiClient } from "@/lib/api-client";

import { applyToJobVacancy } from "./job-vacancies-api";

vi.mock("@/lib/api-client", () => ({
  apiClient: { post: vi.fn() },
}));

const jobPostingId = "11111111-1111-4111-8111-111111111111";
const application = { id: "22222222-2222-4222-8222-222222222222" };

describe("applyToJobVacancy", () => {
  it("posts an application for the job and returns the parsed id", async () => {
    const post = vi
      .spyOn(apiClient, "post")
      .mockResolvedValueOnce({ data: application });

    await expect(applyToJobVacancy(jobPostingId)).resolves.toEqual(application);
    expect(post).toHaveBeenCalledWith(
      "/applications",
      { job_id: jobPostingId },
      {},
    );
  });

  it("forwards an abort signal to the apply request", async () => {
    const controller = new AbortController();
    const post = vi.spyOn(apiClient, "post").mockResolvedValueOnce({
      data: application,
    });

    await applyToJobVacancy(jobPostingId, controller.signal);

    expect(post).toHaveBeenCalledWith(
      "/applications",
      { job_id: jobPostingId },
      { signal: controller.signal },
    );
  });

  it("rejects when the apply response is malformed", async () => {
    vi.spyOn(apiClient, "post").mockResolvedValueOnce({ data: {} });

    await expect(applyToJobVacancy(jobPostingId)).rejects.toMatchObject({
      name: "ApiError",
      code: "invalid_job_application_response",
    });
  });
});
