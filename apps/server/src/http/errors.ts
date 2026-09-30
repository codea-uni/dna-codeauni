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

/**
 * Error con estado HTTP y `code` estable. Se lanza desde los servicios (p. ej. empresa
 * desactivada) y el manejador de errores de la app lo responde como `{ code, message }`.
 */
export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}
