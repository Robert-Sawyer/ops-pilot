import type { FastifyInstance } from "fastify";

import type { AgentRunner } from "../agent/index.js";

interface AgentRequestBody {
  message: string;
}

export interface RegisterAgentRouteOptions {
  agentRunner: AgentRunner | null;
}

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
        return reply.code(503).send({
          error: {
            code: "agent_not_configured",
            message: "Set OPENAI_API_KEY to enable the agent endpoint.",
          },
        });
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
}
