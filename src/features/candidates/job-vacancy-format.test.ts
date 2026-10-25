import { describe, expect, it } from "vitest";

import {
  companyInitials,
  formatPublishedLabel,
  formatSalaryRange,
  formatVacancyMeta,
  formatWorkMode,
} from "./job-vacancy-format";
import { jobDetail } from "../../../tests/job-detail-fixture";

describe("companyInitials", () => {
  it("uses the first letter of the first two words", () => {
    expect(companyInitials("Moveve Distribuição")).toBe("MD");
  });

  it("uses the first two letters of a single word", () => {
    expect(companyInitials("Acme")).toBe("AC");
  });
});

describe("formatWorkMode", () => {
  it("maps each work mode to Portuguese copy", () => {
    expect(formatWorkMode("onsite")).toBe("Presencial");
    expect(formatWorkMode("remote")).toBe("Remoto");
    expect(formatWorkMode("hybrid")).toBe("Híbrido");
  });
});

describe("formatSalaryRange", () => {
  it("formats a closed range in Brazilian reais", () => {
    expect(formatSalaryRange(6500, 8000)).toBe("R$\u00a06.500 a R$\u00a08.000");
  });

  it("formats an open minimum and an open maximum", () => {
    expect(formatSalaryRange(6500, null)).toBe("a partir de R$\u00a06.500");
    expect(formatSalaryRange(null, 8000)).toBe("até R$\u00a08.000");
  });

  it("returns null when the vacancy has no salary", () => {
    expect(formatSalaryRange(null, null)).toBeNull();
  });
});

describe("formatPublishedLabel", () => {
  const now = new Date(2026, 8, 26);

  it("uses calendar days from the leading date, ignoring a time suffix", () => {
    expect(formatPublishedLabel("2026-09-23T23:00:00Z", now)).toBe(
      "publicada há 3 dias",
    );
  });

  it("uses singular copy for yesterday and today for the same calendar day", () => {
    expect(formatPublishedLabel("2026-09-25", now)).toBe("publicada há 1 dia");
    expect(formatPublishedLabel("2026-09-26", now)).toBe("publicada hoje");
  });

  it("returns null when the timestamp has no date prefix", () => {
    expect(formatPublishedLabel("ontem")).toBeNull();
  });
});

describe("formatVacancyMeta", () => {
  it("joins location, work mode, salary and published date", () => {
    expect(formatVacancyMeta(jobDetail, 8000, new Date(2026, 9, 4))).toBe(
      "Example City · Híbrido · até R$\u00a08.000 · publicada há 3 dias",
    );
  });

  it("omits missing optional parts from the metadata line", () => {
    expect(
      formatVacancyMeta(
        {
          ...jobDetail,
          location: null,
          published_at: null,
        },
        null,
        new Date(2026, 8, 26),
      ),
    ).toBe("Híbrido");
  });
});
