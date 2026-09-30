import type { FastifyReply, FastifyRequest } from 'fastify';

/** Headers de Node → `Headers` web, sin los de longitud (el cuerpo se vuelve a serializar). */
export function webHeaders(req: FastifyRequest): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined || key === 'content-length' || key === 'transfer-encoding') continue;
    if (Array.isArray(value)) for (const v of value) headers.append(key, v);
    else headers.set(key, value);
  }
  return headers;
}

/** Petición de Fastify → `Request` web (Better Auth trabaja con la API fetch). */
export function toWebRequest(req: FastifyRequest, baseUrl: string): Request {
  const url = new URL(req.url, baseUrl);
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD' && req.body !== undefined;
  return new Request(url, {
    method: req.method,
    headers: webHeaders(req),
    ...(hasBody ? { body: JSON.stringify(req.body) } : {}),
  });
}

/** Respuesta web → respuesta de Fastify, conservando cada `set-cookie` por separado. */
export async function sendWebResponse(reply: FastifyReply, res: Response): Promise<FastifyReply> {
  reply.code(res.status);
  res.headers.forEach((value, key) => {
    if (key !== 'set-cookie' && key !== 'content-length') void reply.header(key, value);
  });
  const cookies = res.headers.getSetCookie();
  if (cookies.length) void reply.header('set-cookie', cookies);
  const text = await res.text();
  return reply.send(text === '' ? undefined : text);
}
