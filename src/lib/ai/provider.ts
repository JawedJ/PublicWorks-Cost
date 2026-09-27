import type { z } from "zod";

// SPEC 9: every AI call goes through this interface. Feature code never imports a
// vendor SDK. Callers catch `AIUnavailableError` and use their deterministic fallback.

export interface AIProvider {
  name: string;
  generateStructured<S extends z.ZodType>(opts: {
    system: string;
    prompt: string;
    schema: S;
    fast?: boolean;
    /** Documents sent alongside the prompt (e.g. a PDF report), base64. */
    files?: AIFile[];
  }): Promise<z.infer<S>>;
  generateText(opts: {
    system: string;
    prompt: string;
    fast?: boolean;
  }): Promise<string>;
}

export type AIFile = { mimeType: string; dataBase64: string };

export type AIUnavailableReason =
  "no_provider" | "rate_limited" | "timeout" | "error" | "invalid_output";

/** Thrown by providers; always means "use the fallback". */
export class AIUnavailableError extends Error {
  constructor(
    readonly reason: AIUnavailableReason,
    message?: string,
  ) {
    super(message ?? reason);
    this.name = "AIUnavailableError";
  }
}

export const noneProvider: AIProvider = {
  name: "none",
  generateStructured: () =>
    Promise.reject(new AIUnavailableError("no_provider")),
  generateText: () => Promise.reject(new AIUnavailableError("no_provider")),
};
