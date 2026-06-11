import { parseSubscriberPayload, processSubscriberSignup } from "./_lib/subscriber.js";

type RequestLike = {
  method?: string;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
};

type ResponseLike = {
  status: (code: number) => ResponseLike;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
};

export default async function handler(req: RequestLike, res: ResponseLike) {
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST") {
    res.status(405).json({ message: "Method not allowed." });
    return;
  }

  try {
    const payload = parseSubscriberPayload(req.body, req.headers);
    const result = await processSubscriberSignup(payload);
    res.status(200).json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to process newsletter signup.";
    const status =
      message === "Invalid request body." || message === "Please enter a valid email address."
        ? 400
        : 500;
    res.status(status).json({ message });
  }
}
