import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api-error";

import { ContactProfessionalDialog } from "./contact-professional-dialog";

const postMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api-client", () => ({
  apiClient: { post: postMock },
}));

const RESPONSE = {
  id: "contact-1",
  job_id: "job-1",
  candidate_id: "cand-1",
  created_at: "2026-11-04T20:00:00Z",
  email_status: "pending",
};

beforeEach(() => {
  postMock.mockReset();
  postMock.mockResolvedValue({ data: RESPONSE });
});

function renderDialog(onClose = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <ContactProfessionalDialog
        jobId="job-1"
        candidateId="cand-1"
        professionalName="Marcos Silveira"
        onClose={onClose}
      />
    </QueryClientProvider>,
  );

  return { onClose };
}

async function send(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.type(screen.getByLabelText("Mensagem"), text);
  await user.click(screen.getByRole("button", { name: "Enviar mensagem" }));
}

describe("ContactProfessionalDialog", () => {
  it("mostra o profissional e a vaga relacionada", async () => {
    renderDialog();

    const dialog = await screen.findByRole("dialog");

    expect(dialog).toHaveTextContent("Entrar em contato");
    expect(dialog).toHaveTextContent("Marcos Silveira");
    expect(dialog).toHaveTextContent("sobre esta vaga");
  });

  it("abre com o foco no campo de mensagem", async () => {
    renderDialog();

    await screen.findByRole("dialog");

    await waitFor(() => {
      expect(screen.getByLabelText("Mensagem")).toHaveFocus();
    });
  });

  it("não deixa enviar mensagem vazia", async () => {
    const user = userEvent.setup();
    renderDialog();

    await screen.findByRole("dialog");
    await send(user, "   ");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Escreva uma mensagem",
    );
    expect(postMock).not.toHaveBeenCalled();
  });

  it("conta os caracteres sem os espaços das pontas", async () => {
    const user = userEvent.setup();
    renderDialog();

    await screen.findByRole("dialog");
    await user.type(screen.getByLabelText("Mensagem"), "  oi  ");

    expect(screen.getByText("2 de 2000 caracteres")).toBeInTheDocument();
  });

  it("envia só ids e mensagem, confirma sem garantir o e-mail e move o foco", async () => {
    const user = userEvent.setup();
    renderDialog();

    await screen.findByRole("dialog");
    await send(user, "  Olá, temos interesse.  ");

    const status = await screen.findByRole("status");

    expect(status).toHaveTextContent("Mensagem enviada");
    expect(status).toHaveTextContent("pode demorar");
    expect(status).toHaveFocus();
    expect(screen.getByRole("button", { name: "Concluir" })).toBeVisible();
    expect(postMock).toHaveBeenCalledWith("/contacts", {
      job_id: "job-1",
      candidate_id: "cand-1",
      message: "Olá, temos interesse.",
    });
  });

  it("mostra erro de um ApiError real e mantém o texto para tentar de novo", async () => {
    postMock.mockRejectedValueOnce(
      new ApiError({
        message: "Profissional indisponível.",
        status: 409,
        code: "professional_unavailable",
      }),
    );
    const user = userEvent.setup();
    renderDialog();

    await screen.findByRole("dialog");
    await send(user, "Olá");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "não pode receber contatos",
    );
    expect(screen.getByLabelText("Mensagem")).toHaveValue("Olá");

    await user.click(screen.getByRole("button", { name: "Enviar mensagem" }));

    expect(await screen.findByRole("status")).toBeInTheDocument();
  });

  it.each([
    [403, "conta de empresa"],
    [404, "não aparece mais"],
    [422, "entre 1 e 2000"],
  ])("traduz o status %i do back", async (status, expected) => {
    postMock.mockRejectedValueOnce(
      new ApiError({ message: "Falhou.", status }),
    );
    const user = userEvent.setup();
    renderDialog();

    await screen.findByRole("dialog");
    await send(user, "Olá");

    expect(await screen.findByRole("alert")).toHaveTextContent(expected);
  });

  it("mostra erro genérico quando a falha é desconhecida", async () => {
    postMock.mockRejectedValueOnce(new Error("rede"));
    const user = userEvent.setup();
    renderDialog();

    await screen.findByRole("dialog");
    await send(user, "Olá");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível enviar a mensagem",
    );
  });

  it("avisa o pai ao cancelar", async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onClose).toHaveBeenCalledOnce();
  });
});
