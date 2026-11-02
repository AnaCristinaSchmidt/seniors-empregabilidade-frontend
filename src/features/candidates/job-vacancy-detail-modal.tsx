import type { RefObject } from "react";

import { Dialog, DialogContent } from "@/components/ui/dialog";

import {
  JobVacancyDetail,
  type JobVacancyMatchSummary,
} from "./job-vacancy-detail";

interface JobVacancyDetailModalProps {
  jobId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
  salaryMax?: number | null;
  matchSummary?: JobVacancyMatchSummary;
}

export function JobVacancyDetailModal({
  jobId,
  open,
  onOpenChange,
  returnFocusRef,
  ...summary
}: JobVacancyDetailModalProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(isOpen) => {
        // A scrolled popup can blur the trigger during its exit transition.
        if (!isOpen) returnFocusRef?.current?.focus({ preventScroll: true });
      }}
    >
      <DialogContent
        showCloseButton={false}
        finalFocus={returnFocusRef}
        className="max-h-[calc(100dvh-2rem)] w-[min(100%-2rem,40rem)] max-w-none gap-6 overflow-y-auto p-6 sm:p-8"
      >
        {open && jobId ? (
          <JobVacancyDetail
            key={jobId}
            jobId={jobId}
            surface="dialog"
            {...summary}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
