import { LineIdentityError } from "./line.ts";
import type { VerifiedLineIdentity } from "./line.ts";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface LineCustomerCenterDependencies {
  allowedOrigins: Set<string>;
  getLineChannelId: (storeId: string) => Promise<string | null>;
  verifyIdentity: (
    idToken: string,
    channelId: string,
  ) => Promise<VerifiedLineIdentity>;
  loadCustomerCenter: (
    storeId: string,
    identity: VerifiedLineIdentity,
  ) => Promise<Record<string, unknown>>;
}

interface CustomerCenterPayload {
  storeId?: unknown;
  idToken?: unknown;
}

function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin || "https://bookr-5ph.pages.dev",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "apikey, authorization, content-type, x-client-info",
    "Vary": "Origin",
  };
}

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  origin: string | null,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json",
      "Cache-Control": "no-store, private",
    },
  });
}

export function createLineCustomerCenterHandler(
  dependencies: LineCustomerCenterDependencies,
) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get("origin");
    if (origin && !dependencies.allowedOrigins.has(origin)) {
      return jsonResponse(
        { ok: false, error: "Origin not allowed", code: "ORIGIN_NOT_ALLOWED" },
        403,
        null,
      );
    }

    if (request.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders(origin) });
    }

    if (request.method !== "POST") {
      return jsonResponse(
        { ok: false, error: "Method not allowed", code: "METHOD_NOT_ALLOWED" },
        405,
        origin,
      );
    }

    const contentLength = Number(request.headers.get("content-length") || "0");
    if (contentLength > 8_192) {
      return jsonResponse(
        {
          ok: false,
          error: "Request body is too large",
          code: "PAYLOAD_TOO_LARGE",
        },
        413,
        origin,
      );
    }

    let payload: CustomerCenterPayload;
    try {
      payload = await request.json();
    } catch {
      return jsonResponse(
        { ok: false, error: "Invalid JSON body", code: "INVALID_JSON" },
        400,
        origin,
      );
    }

    if (
      typeof payload.storeId !== "string" ||
      typeof payload.idToken !== "string" ||
      !uuidPattern.test(payload.storeId) ||
      payload.idToken.trim().length === 0 ||
      payload.idToken.length > 4_096
    ) {
      return jsonResponse(
        { ok: false, error: "Invalid input", code: "INVALID_INPUT" },
        400,
        origin,
      );
    }

    let channelId: string | null;
    try {
      channelId = await dependencies.getLineChannelId(payload.storeId);
    } catch {
      return jsonResponse(
        { ok: false, error: "Unable to load store", code: "DATABASE_ERROR" },
        500,
        origin,
      );
    }

    if (!channelId) {
      return jsonResponse(
        {
          ok: false,
          error: "LINE customer center is unavailable",
          code: "LINE_NOT_CONFIGURED",
        },
        404,
        origin,
      );
    }

    let identity: VerifiedLineIdentity;
    try {
      identity = await dependencies.verifyIdentity(payload.idToken, channelId);
    } catch (error) {
      const retryable = error instanceof LineIdentityError &&
        error.code === "LINE_VERIFY_UNAVAILABLE";
      return jsonResponse(
        {
          ok: false,
          error: "LINE verification failed",
          code: retryable ? "LINE_VERIFY_UNAVAILABLE" : "LINE_TOKEN_REJECTED",
        },
        retryable ? 503 : 401,
        origin,
      );
    }

    try {
      const result = await dependencies.loadCustomerCenter(
        payload.storeId,
        identity,
      );
      if (result.ok !== true) {
        return jsonResponse(
          {
            ok: false,
            error: "Customer identity not found",
            code: "IDENTITY_NOT_FOUND",
          },
          404,
          origin,
        );
      }
      return jsonResponse(result, 200, origin);
    } catch {
      return jsonResponse(
        {
          ok: false,
          error: "Unable to load customer center",
          code: "DATABASE_ERROR",
        },
        500,
        origin,
      );
    }
  };
}
