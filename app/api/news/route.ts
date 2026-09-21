import { newsService } from "@/lib/news/service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const edition = await newsService.getEdition();
    return Response.json({
      edition: {
        preparedAt: edition.preparedAt,
        fetchedAt: edition.fetchedAt,
        cacheStatus: edition.cacheStatus,
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