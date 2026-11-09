import { useMutation } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

import {
  MAX_MESSAGE_LENGTH,
  contactErrorMessage,
  contactProfessional,
} from "./contact-professional";

interface ContactProfessionalDialogProps {
  jobId: string;
  candidateId: string;
  professionalName: string;
  onClose: () => void;
}

export function ContactProfessionalDialog({
  jobId,
  candidateId,
  professionalName,
  onClose,
}: ContactProfessionalDialogProps) {
  const fieldId = useId();
  const hintId = useId();
  const statusRef = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: contactProfessional,
    retry: false,
    gcTime: 0,
  });

  const sent = mutation.isSuccess;

  // O formulário some no sucesso: levamos o foco para a confirmação, para quem
  // usa teclado ou leitor de tela não ficar solto no <body>.
  useEffect(() => {
    if (sent) {
      statusRef.current?.focus();
    }
  }, [sent]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (message.trim().length === 0) {
      setValidationError("Escreva uma mensagem antes de enviar.");
      return;
    }

    setValidationError(null);
    mutation.mutate({ jobId, candidateId, message });
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        // Fechar no meio do envio esconderia se a mensagem saiu ou não.
        if (!open && !mutation.isPending) {
          onClose();
        }
      }}
    >
      <DialogContent
        className="sm:max-w-xl"
        // Foco explícito no campo ao abrir, em vez de depender da detecção
        // automática do primeiro elemento focável.
        initialFocus={() => document.getElementById(fieldId)}
      >
        <DialogHeader>
          <DialogTitle>Entrar em contato</DialogTitle>
          <DialogDescription>
            Mensagem para <strong>{professionalName}</strong>, sobre esta vaga.
          </DialogDescription>
        </DialogHeader>

        {sent ? (
          <div
            ref={statusRef}
            role="status"
            tabIndex={-1}
            className="flex flex-col gap-4 outline-none"
          >
            <p className="text-lg text-foreground">
              Mensagem enviada. O aviso chega a {professionalName} pela central
              de notificações. O e-mail é enviado em seguida e pode demorar.
            </p>
            <DialogFooter>
              <Button type="button" onClick={onClose}>
                Concluir
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            noValidate
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-2">
              <label htmlFor={fieldId} className="text-lg font-semibold">
                Mensagem
              </label>
              <Textarea
                id={fieldId}
                value={message}
                onChange={(event) => {
                  setMessage(event.target.value);
                  setValidationError(null);
                }}
                maxLength={MAX_MESSAGE_LENGTH}
                rows={7}
                aria-describedby={hintId}
                aria-invalid={validationError !== null}
                disabled={mutation.isPending}
              />
              <p id={hintId} className="text-base text-foreground-2">
                O profissional não pode responder pela plataforma. Informe na
                mensagem como a empresa quer ser contatada. O e-mail pessoal do
                profissional não é exibido para você.
              </p>
              {/* Conta o que o back valida: o texto sem espaços nas pontas. */}
              <p className="text-base text-muted-foreground">
                {message.trim().length} de {MAX_MESSAGE_LENGTH} caracteres
              </p>
            </div>

            {validationError ? (
              <p
                role="alert"
                className="text-base font-semibold text-destructive"
              >
                {validationError}
              </p>
            ) : null}

            {mutation.isError ? (
              <p
                role="alert"
                className="text-base font-semibold text-destructive"
              >
                {contactErrorMessage(mutation.error)}
              </p>
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={mutation.isPending}
                onClick={onClose}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Enviando..." : "Enviar mensagem"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
