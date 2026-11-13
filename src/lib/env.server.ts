import "server-only";
import { serverSchema, type ServerEnv } from "./env";

let cached: ServerEnv | undefined;

/** Validated server-only environment. Throws with a readable message on misconfiguration. */
export function getServerEnv(): ServerEnv {
  if (!cached) {
    const result = serverSchema.safeParse(process.env);
    if (!result.success) {
      const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`Invalid server environment: ${issues}`);
    }
    cached = result.data;
  }
  return cached;
}
