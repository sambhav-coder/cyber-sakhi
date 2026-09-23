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

async function respondSuccess(
  service: Pick<NewsService, "getEdition">,
  language: "en" | "hi"
): Promise<Response> {
  const edition = await service.getEdition({ force: true, language });
  return Response.json({
    ok: true,
    language: edition.language,
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
    // req.url is always present on real NextRequests; unit-test doubles may
    // omit it — treat that as "no lang param" (English default).
    let langParam: string | null = null;
    try {
      langParam = new URL(req.url).searchParams.get("lang");
    } catch {
      langParam = null;
    }
    if (langParam !== null && langParam !== "en" && langParam !== "hi") {
      return Response.json(
        { error: "Unsupported news language. Use lang=en or lang=hi." },
        { status: 400 }
      );
    }
    const language = langParam === "hi" ? "hi" : "en";

    if (auth.kind === "unconfigured") {
      if (config.isProduction) {
        return Response.json(
          { error: "News refresh service is not configured." },
          { status: 503 }
        );
      }
      return respondSuccess(service, language);
    }

    if (auth.kind === "unauthorized") {
      const status = auth.reason === "missing" ? 401 : 403;
      return Response.json({ error: "Unauthorized refresh request." }, { status });
    }

    return respondSuccess(service, language);
  };
}

export const newsRefreshHandler = createRefreshHandler();