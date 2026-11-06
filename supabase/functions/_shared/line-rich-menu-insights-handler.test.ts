import {
  createLineRichMenuInsightsHandler,
  metricsFromInsight,
} from "./line-rich-menu-insights-handler.ts";
import type {
  DailyMetricWrite,
  LineRichMenuInsightJob,
  LineRichMenuInsightsDependencies,
} from "./line-rich-menu-insights-handler.ts";

const publicationId = "10000000-0000-4000-8000-000000000001";
const storeId = "20000000-0000-4000-8000-000000000001";

const job: LineRichMenuInsightJob = {
  publicationId,
  storeId,
  config: {
    pages: [{
      pageKey: "home",
      areas: [
        { areaKey: "booking", x: 0, y: 0, width: 1250, height: 1686 },
        { areaKey: "profile", x: 1250, y: 0, width: 1250, height: 1686 },
      ],
    }],
  },
  resourceMap: { home: { richMenuId: "richmenu-home" } },
  channelAccessToken: "line-access-token",
  publishedAt: "2026-10-01T03:00:00Z",
  finishedAt: null,
};

function request(body: unknown, token = "valid-token") {
  return new Request("http://localhost/line-rich-menu-insights", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Origin: "http://localhost:5173",
    },
    body: JSON.stringify(body),
  });
}

function dependencies(
  overrides: Partial<LineRichMenuInsightsDependencies> = {},
) {
  const writes: DailyMetricWrite[] = [];
  const value: LineRichMenuInsightsDependencies = {
    allowedOrigins: new Set(["http://localhost:5173"]),
    now: () => new Date("2026-11-06T03:00:00Z"),
    authenticate: async () => ({ id: "admin", storeId, role: "admin" }),
    authorizePublication: async () => true,
    getJob: async () => job,
    upsertMetric: async (metric) => {
      writes.push(metric);
      return true;
    },
    lineApi: {
      daily: async () => ({
        richMenuId: "richmenu-home",
        impression: {
          metrics: [{ date: "20261104", count: 100, uniqueUsers: 60 }],
        },
        clicks: [{
          bounds: { x: 0, y: 0, width: 1250, height: 1686 },
          metrics: [{ date: "20261104", count: 20, uniqueUsers: 18 }],
        }],
      }),
    },
    ...overrides,
  };
  return { value, writes };
}

Deno.test("daily insights are mapped to page impressions and matching area clicks", () => {
  const writes = metricsFromInsight(job, job.config.pages[0], {
    richMenuId: "richmenu-home",
    impression: {
      metrics: [{ date: "20261104", count: 100, uniqueUsers: 60 }],
    },
    clicks: [
      {
        bounds: { x: 0, y: 0, width: 1250, height: 1686 },
        metrics: [{ date: "20261104", count: 20, uniqueUsers: 18 }],
      },
      {
        bounds: { x: 10, y: 10, width: 10, height: 10 },
        metrics: [{ date: "20261104", count: 999, uniqueUsers: 999 }],
      },
    ],
  });

  if (writes.length !== 2) {
    throw new Error(`Expected 2 writes, got ${writes.length}`);
  }
  if (writes[0].areaKey !== null || writes[0].impressions !== 100) {
    throw new Error("Impression metric was not mapped to the page");
  }
  if (writes[1].areaKey !== "booking" || writes[1].clicks !== 20) {
    throw new Error("Click metric was not mapped to the matching area");
  }
});

Deno.test("admin can sync LINE daily insights", async () => {
  const { value, writes } = dependencies();
  const response = await createLineRichMenuInsightsHandler(value)(
    request({ publicationId }),
  );
  const body = await response.json();

  if (response.status !== 200 || body.ok !== true || body.syncedRows !== 2) {
    throw new Error(
      `Unexpected response ${response.status}: ${JSON.stringify(body)}`,
    );
  }
  if (writes.length !== 2) throw new Error("Metrics were not persisted");
});

Deno.test("member cannot sync insights", async () => {
  const { value } = dependencies({
    authenticate: async () => ({ id: "member", storeId, role: "member" }),
  });
  const response = await createLineRichMenuInsightsHandler(value)(
    request({ publicationId }),
  );
  if (response.status !== 403) {
    throw new Error(`Expected 403, got ${response.status}`);
  }
});

Deno.test("cross-store publication is hidden", async () => {
  const { value } = dependencies({ authorizePublication: async () => false });
  const response = await createLineRichMenuInsightsHandler(value)(
    request({ publicationId }),
  );
  if (response.status !== 404) {
    throw new Error(`Expected 404, got ${response.status}`);
  }
});

Deno.test("LINE 404 is treated as pending aggregation", async () => {
  const { value } = dependencies({ lineApi: { daily: async () => null } });
  const response = await createLineRichMenuInsightsHandler(value)(
    request({ publicationId }),
  );
  const body = await response.json();
  if (
    response.status !== 200 || body.pendingPages !== 1 || body.syncedRows !== 0
  ) {
    throw new Error(`Unexpected pending response: ${JSON.stringify(body)}`);
  }
});

Deno.test("privacy-threshold response is not recorded as zero", async () => {
  const { value, writes } = dependencies({
    lineApi: { daily: async () => ({ richMenuId: "richmenu-home" }) },
  });
  const response = await createLineRichMenuInsightsHandler(value)(
    request({ publicationId }),
  );
  const body = await response.json();
  if (body.privacyLimitedPages !== 1 || writes.length !== 0) {
    throw new Error(`Unexpected privacy response: ${JSON.stringify(body)}`);
  }
});

Deno.test("invalid publication id is rejected before database access", async () => {
  let authorized = false;
  const { value } = dependencies({
    authorizePublication: async () => {
      authorized = true;
      return true;
    },
  });
  const response = await createLineRichMenuInsightsHandler(value)(
    request({ publicationId: "not-a-uuid" }),
  );
  if (response.status !== 400 || authorized) {
    throw new Error("Invalid ID should be rejected before authorization");
  }
});
