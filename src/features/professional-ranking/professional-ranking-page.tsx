import { getRouteApi } from "@tanstack/react-router";
import { z } from "zod";

import { ProfessionalRankingView } from "./professional-ranking-view";

// Acessa os params da rota pelo id, sem importar o arquivo da rota
// (evita dependência circular entre feature e routes).
const routeApi = getRouteApi("/empresa/vagas_/$jobId/candidatos");

const paramsSchema = z.object({ jobId: z.string().min(1) });

/**
 * Lê o id da vaga da URL (/empresa/vagas/:jobId/candidatos) e entrega para a
 * tela. Fica aqui, e não no arquivo da rota, para a rota exportar só `Route`.
 */
export function ProfessionalRankingPage() {
  // Validamos em runtime: não dependemos do tipo que o router devolve.
  const params: unknown = routeApi.useParams();
  const parsed = paramsSchema.safeParse(params);

  if (!parsed.success) {
    return (
      <p role="alert" className="p-6 text-lg text-foreground md:p-8">
        Vaga não encontrada.
      </p>
    );
  }

  return <ProfessionalRankingView jobId={parsed.data.jobId} />;
}
