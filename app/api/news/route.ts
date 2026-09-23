import { newsService } from "@/lib/news/service";
import type { NewsLanguage } from "@/lib/news/types";

export const dynamic = "force-dynamic";

function parseLanguage(value: string | null): NewsLanguage | null {
  if (value === null || value === "") return "en";
  if (value === "en" || value === "hi") return value;
  return null;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const language = parseLanguage(url.searchParams.get("lang"));
    if (!language) {
      return Response.json(
        { error: "Unsupported news language. Use lang=en or lang=hi." },
        { status: 400 }
      );
    }
    const edition = await newsService.getEdition({ language });
    return Response.json({
      edition: {
        preparedAt: edition.preparedAt,
        fetchedAt: edition.fetchedAt,
        cacheStatus: edition.cacheStatus,
        language: edition.language,
        feedsTotal: edition.feedsTotal,
        feedsOk: edition.feedsOk,
        lead: edition.lead,
        stories: edition.stories,
        cyberWatch: edition.cyberWatch,
      },
    });
  } catch {
    return Response.json(
      { error: "The News Desk could not prepare a briefing right now." },
      { status: 500 }
    );
  }
}
