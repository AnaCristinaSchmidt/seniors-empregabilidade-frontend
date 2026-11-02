import { getRouteApi, Link } from "@tanstack/react-router";
import { z } from "zod";

import { JobVacancyDetail } from "./job-vacancy-detail";

const routeApi = getRouteApi("/candidato/vagas_/$jobId");
const paramsSchema = z.object({ jobId: z.string().min(1) });

interface JobVacancyDetailPageProps {
  jobId: string;
}

export function CandidateJobDetailPage() {
  // The route id is trusted at compile time. Parse it again so a bad param
  // cannot reach the detail request as an unexpected value.
  const params: unknown = routeApi.useParams();
  const parsed = paramsSchema.safeParse(params);

  if (!parsed.success) {
    return (
      <div className="min-h-full bg-muted p-4 md:p-8">
        <h1 className="mb-6 text-3xl font-bold text-foreground">
          Detalhes da vaga
        </h1>
        <p role="alert" className="text-lg text-foreground">
          Esta vaga não está disponível.
        </p>
      </div>
    );
  }

  return <JobVacancyDetailPage jobId={parsed.data.jobId} />;
}

export function JobVacancyDetailPage({ jobId }: JobVacancyDetailPageProps) {
  return (
    <div className="min-h-full bg-muted p-4 md:p-8">
      <h1 className="mb-6 text-3xl font-bold text-foreground">
        Detalhes da vaga
      </h1>
      <Link
        to="/candidato/candidaturas"
        className="mb-6 inline-flex min-h-11 items-center text-lg font-medium text-foreground underline underline-offset-4 focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none"
      >
        Voltar para candidaturas
      </Link>
      <div className="flex max-w-3xl flex-col gap-6 rounded-lg border border-border bg-background p-6 sm:p-8">
        <JobVacancyDetail key={jobId} jobId={jobId} surface="page" />
      </div>
    </div>
  );
}
