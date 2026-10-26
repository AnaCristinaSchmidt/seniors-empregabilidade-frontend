import { afterEach, describe, expect, it } from "vitest";

import { fetchJobApplicants } from "@/lib/job-applicants";
import { stubApi, type ApiStub } from "../../../tests/api-stub";
import {
  changeApplicationStatus,
  fetchApplicantDetail,
} from "./job-candidates-api";

const id = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
let stub: ApiStub | undefined;
afterEach(() => {
  stub?.restore();
});
const profile = {
  application_id: id,
  candidate_id: otherId,
  full_name: "Pessoa Exemplo",
  city: null,
  state: null,
  summary: null,
  experiences: [],
  education: [],
  certifications: [],
  skills: [],
};
const automatic = {
  origin: "automatic_match",
  application_id: null,
  status: null,
  match_score: null,
  compatibility_percentage: "66.67",
  is_highlighted: true,
  matched_skill_count: 2,
  required_skill_count: 3,
  profile: {
    candidate_id: otherId,
    full_name: "Pessoa Exemplo",
    city: null,
    state: null,
  },
};
const summary = {
  job_id: id,
  total_applicant_count: 0,
  full_match_count: 0,
  automatic_match_count: 1,
  applicants: [automatic],
};

describe("candidate management API boundaries", () => {
  it("accepts an automatic match with no application and converts decimal percentages", async () => {
    stub = stubApi(200, summary);
    const result = await fetchJobApplicants(id);
    expect(result.applicants[0]?.compatibility_percentage).toBe(66.67);
    expect(result.applicants[0]?.application_id).toBeNull();
  });

  it("rejects a response for another job", async () => {
    stub = stubApi(200, { ...summary, job_id: otherId });
    await expect(fetchJobApplicants(id)).rejects.toMatchObject({
      code: "invalid_job_applicants_response",
    });
  });

  it("rejects an application whose identifier or status is missing", async () => {
    stub = stubApi(200, {
      ...summary,
      applicants: [{ ...automatic, origin: "application" }],
    });
    await expect(fetchJobApplicants(id)).rejects.toMatchObject({
      code: "invalid_job_applicants_response",
    });
  });

  it("loads only the requested applicant profile", async () => {
    stub = stubApi(200, profile);
    expect(
      await fetchApplicantDetail(id, new AbortController().signal),
    ).toEqual(profile);
    expect(stub.requests[0]?.url).toBe(`/applications/${id}/profile`);
  });

  it("rejects a profile returned for a different application", async () => {
    stub = stubApi(200, { ...profile, application_id: otherId });
    await expect(fetchApplicantDetail(id)).rejects.toMatchObject({
      code: "invalid_applicant_profile_response",
    });
  });

  it("sends the final decision and reason and validates the returned decision", async () => {
    stub = stubApi(200, {
      application_id: id,
      candidate_id: otherId,
      job_id: id,
      status: "not_selected",
      updated_at: "2026-10-26T12:00:00Z",
    });
    await changeApplicationStatus({
      applicationId: id,
      status: "not_selected",
      reason: "Motivo de exemplo.",
    });
    expect(stub.requests[0]?.body).toEqual({
      status: "not_selected",
      reason: "Motivo de exemplo.",
    });
  });

  it("rejects a success response with a different status", async () => {
    stub = stubApi(200, {
      application_id: id,
      candidate_id: otherId,
      job_id: id,
      status: "under_review",
      updated_at: "2026-10-26T12:00:00Z",
    });
    await expect(
      changeApplicationStatus({ applicationId: id, status: "hired" }),
    ).rejects.toMatchObject({ code: "invalid_application_action_response" });
  });
});
