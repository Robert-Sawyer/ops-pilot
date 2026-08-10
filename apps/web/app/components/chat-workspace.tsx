"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";

import {
  AgentApiError,
  resolveAgentConfirmation,
  runAgent,
  type AgentRunResult,
  type AgentTraceStep,
  type PendingConfirmation,
} from "../../lib/agent-api";
import { TracePanel } from "./trace-panel";

type MessageRole = "assistant" | "user" | "activity" | "error";

interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
}

const suggestions = [
  "Investigate payment failures",
  "Check notifications-api health",
  "Retry payment_123",
];

const initialMessages: ChatMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    content:
      "I’m connected to the local operations dataset. Ask me to investigate a service issue, inspect a payment, or search a runbook.",
  },
];

const createMessageId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

const formatToolCall = (confirmation: PendingConfirmation) => {
  const arguments_ = confirmation.arguments;
  if (
    typeof arguments_ === "object" &&
    arguments_ !== null &&
    "paymentId" in arguments_ &&
    typeof arguments_.paymentId === "string"
  ) {
    return `${confirmation.toolName}("${arguments_.paymentId}")`;
  }

  return `${confirmation.toolName}(${JSON.stringify(arguments_)})`;
};

export function ChatWorkspace() {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [trace, setTrace] = useState<AgentTraceStep[]>([]);
  const [pendingConfirmation, setPendingConfirmation] =
    useState<PendingConfirmation | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pendingConfirmation, isRunning]);

  const applyAgentResult = (result: AgentRunResult) => {
    setTrace(result.trace);

    if (result.status === "requires_confirmation") {
      setPendingConfirmation(result.confirmation);
      return;
    }

    setPendingConfirmation(null);
    setMessages((current) => [
      ...current,
      { id: createMessageId(), role: "assistant", content: result.answer },
    ]);
  };

  const reportError = (error: unknown) => {
    setMessages((current) => [
      ...current,
      {
        id: createMessageId(),
        role: "error",
        content:
          error instanceof Error
            ? error.message
            : "The agent request failed unexpectedly.",
      },
    ]);
  };

  const sendMessage = async (message: string) => {
    const normalizedMessage = message.trim();
    if (!normalizedMessage || isRunning || pendingConfirmation) return;

    setMessages((current) => [
      ...current,
      { id: createMessageId(), role: "user", content: normalizedMessage },
    ]);
    setDraft("");
    setTrace([]);
    setIsRunning(true);

    try {
      applyAgentResult(await runAgent(normalizedMessage));
    } catch (error) {
      reportError(error);
    } finally {
      setIsRunning(false);
      inputRef.current?.focus();
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void sendMessage(draft);
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(draft);
    }
  };

  const resolveConfirmation = async (approved: boolean) => {
    if (!pendingConfirmation || isResolving) return;

    const confirmationId = pendingConfirmation.id;
    const toolName = pendingConfirmation.toolName;
    setIsResolving(true);

    try {
      const result = await resolveAgentConfirmation(confirmationId, approved);
      setMessages((current) => [
        ...current,
        {
          id: createMessageId(),
          role: "activity",
          content: approved
            ? `Confirmed ${toolName}.`
            : `Cancelled ${toolName}.`,
        },
      ]);
      applyAgentResult(result);
    } catch (error) {
      reportError(error);
      if (error instanceof AgentApiError && error.status === 404) {
        setPendingConfirmation(null);
      }
    } finally {
      setIsResolving(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#workspace" aria-label="Ops Pilot home">
          <span className="brand-mark" aria-hidden="true">OP</span>
          <span>
            <strong>Ops Pilot</strong>
            <small>Developer Operations Agent</small>
          </span>
        </a>
        <div className="environment-pill">
          <span aria-hidden="true" />
          Local simulation
        </div>
      </header>

      <main className="product-layout" id="workspace">
        <section className="chat-panel" aria-labelledby="chat-title">
          <header className="chat-header">
            <div>
              <p className="section-kicker">Operations console</p>
              <h1 id="chat-title">Investigate with evidence</h1>
              <p>
                Ops Pilot decides which typed tools to call and records every step.
              </p>
            </div>
            <div className="service-chips" aria-label="Monitored services">
              <span>payments-api</span>
              <span>notifications-api</span>
              <span>user-service</span>
            </div>
          </header>

          <div className="conversation" aria-live="polite" aria-busy={isRunning}>
            {messages.map((message) => (
              <article className={`message message-${message.role}`} key={message.id}>
                <span className="message-author">
                  {message.role === "user"
                    ? "You"
                    : message.role === "assistant"
                      ? "Ops Pilot"
                      : message.role === "error"
                        ? "Request failed"
                        : "Decision"}
                </span>
                <p>{message.content}</p>
              </article>
            ))}

            {isRunning ? (
              <article className="message message-assistant message-thinking">
                <span className="message-author">Ops Pilot</span>
                <div className="thinking-row">
                  <span />
                  <span />
                  <span />
                  <small>Investigating</small>
                </div>
              </article>
            ) : null}

            {pendingConfirmation ? (
              <section
                className="confirmation-card"
                role="alertdialog"
                aria-labelledby="confirmation-title"
                aria-describedby="confirmation-description"
              >
                <div className="confirmation-icon" aria-hidden="true">!</div>
                <div className="confirmation-content">
                  <p className="section-kicker">Dangerous action</p>
                  <h2 id="confirmation-title">{pendingConfirmation.title}</h2>
                  <p id="confirmation-description">
                    {pendingConfirmation.description}
                  </p>
                  <div className="tool-preview">
                    <span>AI wants to execute</span>
                    <code>{formatToolCall(pendingConfirmation)}</code>
                  </div>
                  <div className="confirmation-actions">
                    <button
                      className="button button-secondary"
                      disabled={isResolving}
                      onClick={() => void resolveConfirmation(false)}
                      type="button"
                    >
                      Cancel
                    </button>
                    <button
                      className="button button-danger"
                      disabled={isResolving}
                      onClick={() => void resolveConfirmation(true)}
                      type="button"
                    >
                      {isResolving ? "Processing…" : "Confirm retry"}
                    </button>
                  </div>
                </div>
              </section>
            ) : null}
            <div ref={messagesEndRef} />
          </div>

          <div className="composer-area">
            {messages.length === 1 ? (
              <div className="suggestions" aria-label="Example requests">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => void sendMessage(suggestion)}
                    type="button"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            ) : null}
            <form className="composer" onSubmit={handleSubmit}>
              <label className="sr-only" htmlFor="agent-message">
                Message Ops Pilot
              </label>
              <textarea
                id="agent-message"
                ref={inputRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder={
                  pendingConfirmation
                    ? "Resolve the pending action to continue"
                    : "Ask Ops Pilot to investigate an operational issue…"
                }
                rows={2}
                maxLength={4_000}
                disabled={isRunning || Boolean(pendingConfirmation)}
              />
              <button
                className="send-button"
                type="submit"
                disabled={
                  isRunning || Boolean(pendingConfirmation) || !draft.trim()
                }
                aria-label="Send message"
              >
                <span>Send</span>
                <span aria-hidden="true">↗</span>
              </button>
            </form>
            <p className="composer-hint">
              Enter to send · Shift + Enter for a new line
            </p>
          </div>
        </section>

        <TracePanel trace={trace} isRunning={isRunning || isResolving} />
      </main>

      <footer className="app-footer">
        <p>Local demo data only. Dangerous actions require explicit confirmation.</p>
        <span>OpenAI Responses API · Fastify · Next.js</span>
      </footer>
    </div>
  );
}
