import { useMutation } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api-error";
import { type DownloadedFile, saveFile } from "@/lib/download-file";

interface ExportDataButtonProps {
  /** Fetch the CSV for the filters the screen currently applies. */
  onExport: () => Promise<DownloadedFile>;
}

/**
 * The "Exportar dados" action of the administrator screens. The button keeps
 * keyboard focus while the file is generated, and the outcome is announced
 * next to it.
 */
export function ExportDataButton({ onExport }: ExportDataButtonProps) {
  const exportFile = useMutation({
    mutationFn: onExport,
    onSuccess: saveFile,
  });

  return (
    <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
      <Button
        type="button"
        variant="outline"
        disabled={exportFile.isPending}
        focusableWhenDisabled
        onClick={() => {
          exportFile.mutate();
        }}
      >
        {exportFile.isPending ? "Gerando arquivo…" : "Exportar dados"}
      </Button>
      {exportFile.isSuccess ? (
        <p role="status" className="text-base text-muted-foreground">
          Arquivo CSV exportado.
        </p>
      ) : null}
      {exportFile.isError ? (
        <p role="alert" className="max-w-sm text-base text-destructive">
          {exportErrorMessage(exportFile.error)}
        </p>
      ) : null}
    </div>
  );
}

function exportErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) {
    return "Apenas administradores podem exportar os dados.";
  }
  return "Não foi possível exportar os dados. Tente novamente.";
}
