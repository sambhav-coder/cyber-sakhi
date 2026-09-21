import { newsService, type NewsService } from "./service";
import type { NextRequest } from "next/server";

export interface RefreshEnv {
  token: string | undefined;
  isProduction: boolean;
}

export function resolveRefreshEnv(env: NodeJS.ProcessEnv = process.env): RefreshEnv {
  return {
    token: env.NEWS_REFRESH_TOKEN,
    isProduction: env.NODE_ENV === "production",
  };
}

export type RefreshAuth =
  | { kind: "authorized" }
  | { kind: "unauthorized"; reason: "missing" | "wrong" }
  | { kind: "unconfigured" };

export function authorizeRefresh(
  req: Pick<NextRequest, "headers">,
  env: RefreshEnv
): RefreshAuth {
  const { token } = env;
  if (!token) return { kind: "unconfigured" };
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  const header = req.headers.get("x-news-refresh-token");
  if (header !== null && header === token) return { kind: "authorized" };
  if (bearer !== null && bearer === token) return { kind: "authorized" };
  return { kind: "unauthorized", reason: header === null && bearer === null ? "missing" : "wrong" };
}

async function respondSuccess(service: Pick<NewsService, "getEdition">): Promise<Response> {
  const edition = await service.getEdition({ force: true });
  return Response.json({
    ok: true,
    preparedAt: edition.preparedAt,
    fetchedAt: edition.fetchedAt,
    cacheStatus: edition.cacheStatus,
    feedsTotal: edition.feedsTotal,
    feedsOk: edition.feedsOk,
    articleCount: edition.articles.length,
  });
}

export function createRefreshHandler(deps?: {
  service?: Pick<NewsService, "getEdition">;
  env?: NodeJS.ProcessEnv;
}) {
  const service = deps?.service ?? newsService;
  const env = deps?.env;
  return async function handleRefresh(req: NextRequest): Promise<Response> {
    const config = resolveRefreshEnv(env);
    const auth = authorizeRefresh(req, config);

    if (auth.kind === "unconfigured") {
      if (config.isProduction) {
        return Response.json(
          { error: "News refresh service is not configured." },
          { status: 503 }
        );
      }
      return respondSuccess(service);
    }

    if (auth.kind === "unauthorized") {
      const status = auth.reason === "missing" ? 401 : 403;
      return Response.json({ error: "Unauthorized refresh request." }, { status });
    }

    return respondSuccess(service);
  };
}

export const newsRefreshHandler = createRefreshHandler();