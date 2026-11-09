const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DAY_MS = 24 * 60 * 60 * 1000;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

interface InsightAdmin {
  id: string;
  storeId: string;
  role: "admin" | "member";
}

interface InsightBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface InsightMetric {
  date: string;
  count: number;
  uniqueUsers: number;
}

export interface LineRichMenuDailyInsight {
  richMenuId: string;
  metricsFrom?: string;
  metricsTo?: string;
  impression?: { metrics: InsightMetric[] };
  clicks?: Array<{ bounds: InsightBounds; metrics: InsightMetric[] }>;
}

interface InsightPage {
  pageKey: string;
  areas: Array<InsightBounds & { areaKey: string }>;
}

export interface LineRichMenuInsightJob {
  publicationId: string;
  storeId: string;
  config: { pages: InsightPage[] };
  resourceMap: Record<string, { richMenuId?: string }>;
  channelAccessToken: string;
  publishedAt: string;
  finishedAt: string | null;
}

export interface DailyMetricWrite {
  publicationId: string;
  metricDate: string;
  pageKey: string;
  areaKey: string | null;
  impressions: number;
  clicks: number;
  uniqueUsers: number | null;
}

export interface LineRichMenuInsightsApi {
  daily: (
    accessToken: string,
    richMenuId: string,
    from: string,
    to: string,
  ) => Promise<LineRichMenuDailyInsight | null>;
}

export interface LineRichMenuInsightsDependencies {
  authenticate: (token: string) => Promise<InsightAdmin | null>;
  authorizePublication: (
    publicationId: string,
    storeId: string,
  ) => Promise<boolean>;
  getJob: (publicationId: string) => Promise<LineRichMenuInsightJob | null>;
  upsertMetric: (metric: DailyMetricWrite) => Promise<boolean>;
  lineApi: LineRichMenuInsightsApi;
  allowedOrigins: Set<string>;
  now?: () => Date;
}

export class LineRichMenuInsightError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "LineRichMenuInsightError";
    this.status = status;
    this.code = code;
  }
}

function corsHeaders(origin: string | null, allowedOrigins: Set<string>) {
  const allowedOrigin = origin && allowedOrigins.has(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
}

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  origin: string | null,
  allowedOrigins: Set<string>,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin, allowedOrigins),
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function toJstDate(date: Date) {
  return new Date(date.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

function compactDate(date: string) {
  return date.replaceAll("-", "");
}

function expandedDate(date: string) {
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
}

function startOfInsightRange(job: LineRichMenuInsightJob, yesterday: Date) {
  const thirtyDaysAgo = new Date(yesterday.getTime() - (29 * DAY_MS));
  const publishedDate = new Date(job.publishedAt);
  return toJstDate(publishedDate) > toJstDate(thirtyDaysAgo)
    ? toJstDate(publishedDate)
    : toJstDate(thirtyDaysAgo);
}

function equalBounds(left: InsightBounds, right: InsightBounds) {
  return left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height;
}

export function metricsFromInsight(
  job: LineRichMenuInsightJob,
  page: InsightPage,
  insight: LineRichMenuDailyInsight,
) {
  const writes: DailyMetricWrite[] = [];

  for (const metric of insight.impression?.metrics ?? []) {
    writes.push({
      publicationId: job.publicationId,
      metricDate: expandedDate(metric.date),
      pageKey: page.pageKey,
      areaKey: null,
      impressions: metric.count,
      clicks: 0,
      uniqueUsers: metric.uniqueUsers,
    });
  }

  for (const click of insight.clicks ?? []) {
    const area = page.areas.find((candidate) =>
      equalBounds(candidate, click.bounds)
    );
    if (!area) continue;

    for (const metric of click.metrics) {
      writes.push({
        publicationId: job.publicationId,
        metricDate: expandedDate(metric.date),
        pageKey: page.pageKey,
        areaKey: area.areaKey,
        impressions: 0,
        clicks: metric.count,
        uniqueUsers: metric.uniqueUsers,
      });
    }
  }

  return writes;
}

function errorResponse(
  error: unknown,
  origin: string | null,
  allowedOrigins: Set<string>,
) {
  if (error instanceof LineRichMenuInsightError) {
    return jsonResponse(
      { ok: false, code: error.code },
      error.status,
      origin,
      allowedOrigins,
    );
  }

  console.error("LINE rich menu insights failed", error);
  return jsonResponse(
    { ok: false, code: "INSIGHT_SYNC_FAILED" },
    500,
    origin,
    allowedOrigins,
  );
}

export function createLineRichMenuInsightsHandler(
  dependencies: LineRichMenuInsightsDependencies,
) {
  return async (request: Request) => {
    const origin = request.headers.get("Origin");

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin, dependencies.allowedOrigins),
      });
    }

    if (request.method !== "POST") {
      return jsonResponse(
        { ok: false, code: "METHOD_NOT_ALLOWED" },
        405,
        origin,
        dependencies.allowedOrigins,
      );
    }

    try {
      const bearer = request.headers.get("Authorization")?.match(
        /^Bearer\s+(.+)$/i,
      )?.[1];
      if (!bearer) {
        throw new LineRichMenuInsightError(
          401,
          "UNAUTHORIZED",
          "Missing token",
        );
      }

      const admin = await dependencies.authenticate(bearer);
      if (!admin) {
        throw new LineRichMenuInsightError(
          401,
          "UNAUTHORIZED",
          "Invalid token",
        );
      }
      if (admin.role !== "admin") {
        throw new LineRichMenuInsightError(
          403,
          "ADMIN_REQUIRED",
          "Admin role required",
        );
      }

      const body = await request.json().catch(() => null) as
        | Record<string, unknown>
        | null;
      const publicationId = typeof body?.publicationId === "string"
        ? body.publicationId.trim()
        : "";
      if (!uuidPattern.test(publicationId)) {
        throw new LineRichMenuInsightError(
          400,
          "INVALID_PUBLICATION_ID",
          "Invalid publication ID",
        );
      }

      if (
        !await dependencies.authorizePublication(publicationId, admin.storeId)
      ) {
        throw new LineRichMenuInsightError(
          404,
          "PUBLICATION_NOT_FOUND",
          "Publication not found",
        );
      }

      const job = await dependencies.getJob(publicationId);
      if (!job || job.storeId !== admin.storeId) {
        throw new LineRichMenuInsightError(
          409,
          "INSIGHT_JOB_UNAVAILABLE",
          "Insight job unavailable",
        );
      }

      const now = dependencies.now?.() ?? new Date();
      const yesterday = new Date(now.getTime() - DAY_MS);
      const from = startOfInsightRange(job, yesterday);
      const to = toJstDate(yesterday);
      if (from > to) {
        return jsonResponse(
          { ok: true, syncedRows: 0, pending: true },
          200,
          origin,
          dependencies.allowedOrigins,
        );
      }

      let syncedRows = 0;
      let pendingPages = 0;
      let privacyLimitedPages = 0;

      for (const page of job.config.pages) {
        const richMenuId = job.resourceMap[page.pageKey]?.richMenuId;
        if (!richMenuId) continue;

        const insight = await dependencies.lineApi.daily(
          job.channelAccessToken,
          richMenuId,
          compactDate(from),
          compactDate(to),
        );
        if (!insight) {
          pendingPages += 1;
          continue;
        }

        if (!insight.impression && !insight.clicks) {
          privacyLimitedPages += 1;
          continue;
        }

        for (const metric of metricsFromInsight(job, page, insight)) {
          if (!await dependencies.upsertMetric(metric)) {
            throw new LineRichMenuInsightError(
              500,
              "METRIC_WRITE_FAILED",
              "Metric write failed",
            );
          }
          syncedRows += 1;
        }
      }

      return jsonResponse(
        {
          ok: true,
          syncedRows,
          pendingPages,
          privacyLimitedPages,
          metricsFrom: from,
          metricsTo: to,
        },
        200,
        origin,
        dependencies.allowedOrigins,
      );
    } catch (error) {
      return errorResponse(error, origin, dependencies.allowedOrigins);
    }
  };
}

export function createLineRichMenuInsightsApi(
  fetcher: typeof fetch = fetch,
): LineRichMenuInsightsApi {
  return {
    daily: async (accessToken, richMenuId, from, to) => {
      const url = new URL(
        `https://api.line.me/v2/bot/insight/richmenu/${
          encodeURIComponent(richMenuId)
        }/daily`,
      );
      url.searchParams.set("from", from);
      url.searchParams.set("to", to);

      const response = await fetcher(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (response.status === 404) return null;
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new LineRichMenuInsightError(
          response.status === 429 ? 429 : 502,
          response.status === 429 ? "LINE_RATE_LIMITED" : "LINE_INSIGHT_ERROR",
          `LINE insight API ${response.status}: ${body.slice(0, 300)}`,
        );
      }

      return await response.json() as LineRichMenuDailyInsight;
    },
  };
}
