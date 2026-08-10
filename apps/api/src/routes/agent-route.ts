import type { FastifyInstance } from "fastify";

import {
  AgentConfirmationNotFoundError,
  type AgentRunner,
} from "../agent/index.js";

interface AgentRequestBody {
  message: string;
}

interface ConfirmationRequestBody {
  confirmationId: string;
  approved: boolean;
}

export interface RegisterAgentRouteOptions {
  agentRunner: AgentRunner | null;
}

const notConfiguredResponse = {
  error: {
    code: "agent_not_configured",
    message: "Set OPENAI_API_KEY to enable the agent endpoint.",
  },
};

export function registerAgentRoute(
  app: FastifyInstance,
  { agentRunner }: RegisterAgentRouteOptions,
) {
  app.post<{ Body: AgentRequestBody }>(
    "/api/agent/run",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["message"],
          properties: {
            message: {
              type: "string",
              minLength: 1,
              maxLength: 4_000,
              pattern: "\\S",
            },
          },
        },
      },
    },
    async (request, reply) => {
      if (!agentRunner) {
        return reply.code(503).send(notConfiguredResponse);
      }

      try {
        return await agentRunner.run(request.body.message);
      } catch (error) {
        request.log.error({ err: error }, "Agent run failed");
        return reply.code(502).send({
          error: {
            code: "agent_run_failed",
            message: "The agent could not complete the investigation.",
          },
        });
      }
    },
  );

  app.post<{ Body: ConfirmationRequestBody }>(
    "/api/agent/confirm",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["confirmationId", "approved"],
          properties: {
            confirmationId: { type: "string", minLength: 1, maxLength: 100 },
            approved: { type: "boolean" },
          },
        },
      },
    },
    async (request, reply) => {
      if (!agentRunner) {
        return reply.code(503).send(notConfiguredResponse);
      }

      try {
        return await agentRunner.resolveConfirmation(
          request.body.confirmationId,
          request.body.approved,
        );
      } catch (error) {
        if (error instanceof AgentConfirmationNotFoundError) {
          return reply.code(404).send({
            error: {
              code: "confirmation_not_found",
              message: error.message,
            },
          });
        }

        request.log.error({ err: error }, "Agent confirmation failed");
        return reply.code(502).send({
          error: {
            code: "agent_run_failed",
            message: "The agent could not complete the confirmed action.",
          },
        });
      }
    },
  );
}
