import { newsRefreshHandler } from "@/lib/news/refreshAuth";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<Response> {
  return newsRefreshHandler(req);
}

export async function GET(req: NextRequest): Promise<Response> {
  return newsRefreshHandler(req);
}