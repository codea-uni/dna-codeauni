import type { ApiErrorBody } from '@cronos/api';
import type { FastifyReply } from 'fastify';

/** Error con el cuerpo estándar `{ code, message }`; `code` es estable y la web lo traduce. */
export function sendError(
  reply: FastifyReply,
  status: number,
  code: string,
  message: string,
): FastifyReply {
  const body: ApiErrorBody = { code, message };
  return reply.code(status).send(body);
}
