type NetlifyEvent = {
  body: string | null;
  headers: Record<string, string | undefined>;
  httpMethod: string;
  isBase64Encoded?: boolean;
  queryStringParameters?: Record<string, string | undefined> | null;
};

type ApiRequest = {
  method?: string;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
};

type ApiResponse = {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
  send: (body: string) => void;
  setHeader: (name: string, value: string) => void;
};

type ApiHandler = (req: ApiRequest, res: ApiResponse) => Promise<void> | void;

function parseBody(event: NetlifyEvent): unknown {
  if (!event.body) return undefined;

  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;
  const contentType = event.headers["content-type"] ?? event.headers["Content-Type"] ?? "";

  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(rawBody);
    } catch {
      return rawBody;
    }
  }

  return rawBody;
}

export async function runApiHandler(event: NetlifyEvent, handler: ApiHandler) {
  let statusCode = 200;
  let responseBody = "";
  const headers: Record<string, string> = {};

  const res: ApiResponse = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(body: unknown) {
      headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
      responseBody = JSON.stringify(body);
    },
    send(body: string) {
      responseBody = body;
    },
    setHeader(name: string, value: string) {
      headers[name] = value;
    },
  };

  await handler(
    {
      method: event.httpMethod,
      body: parseBody(event),
      headers: event.headers,
      query: event.queryStringParameters ?? {},
    },
    res,
  );

  return {
    statusCode,
    headers,
    body: responseBody,
  };
}
