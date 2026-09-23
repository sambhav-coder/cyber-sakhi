import { describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import {
  createRefreshHandler,
} from "@/lib/news/refreshAuth";
import type { NewsEdition } from "@/lib/news/types";

function edition(overrides: Partial<NewsEdition> = {}): NewsEdition {
  return {
    preparedAt: "2026-09-19T12:00:00.000Z",
    fetchedAt: "2026-09-19T12:00:00.000Z",
    cacheStatus: "live",
    language: "en",
    feedsTotal: 1,
    feedsOk: 1,
    articles: [],
    lead: null,
    stories: [],
    cyberWatch: [],
    ...overrides,
  };
}

function mockRequest(headers: Record<string, string>): NextRequest {
  const h = new Headers();
  for (const [k, v] of Object.entries(headers)) h.set(k, v);
  return { headers: h } as unknown as NextRequest;
}

function prodEnv(token?: string): NodeJS.ProcessEnv {
  return token === undefined
    ? { NODE_ENV: "production" }
    : { NODE_ENV: "production", NEWS_REFRESH_TOKEN: token };
}

describe("news refresh route security", () => {
  it("returns 503 and performs no refresh when the token is not configured in production", async () => {
    const getEdition = vi.fn(async () => edition());
    const handle = createRefreshHandler({ service: { getEdition }, env: prodEnv() });

    const res = await handle(mockRequest({}));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/not configured/i);
    expect(getEdition).not.toHaveBeenCalled();
  });

  it("makes no external feed request when configuration is missing in production", async () => {
    const getEdition = vi.fn(async () => edition());
    const handle = createRefreshHandler({ service: { getEdition }, env: prodEnv() });

    const res = await handle(mockRequest({ "x-news-refresh-token": "whatever" }));
    expect(res.status).toBe(503);
    expect(getEdition).not.toHaveBeenCalled();
  });

  it("rejects a missing token with 401 when production and the token is configured", async () => {
    const getEdition = vi.fn(async () => edition());
    const handle = createRefreshHandler({ service: { getEdition }, env: prodEnv("s3cr3t") });

    const res = await handle(mockRequest({}));
    expect(res.status).toBe(401);
    expect(getEdition).not.toHaveBeenCalled();
  });

  it("rejects a wrong refresh token with 403 when production", async () => {
    const getEdition = vi.fn(async () => edition());
    const handle = createRefreshHandler({ service: { getEdition }, env: prodEnv("s3cr3t") });

    const res = await handle(mockRequest({ "x-news-refresh-token": "nope" }));
    expect(res.status).toBe(403);
    expect(getEdition).not.toHaveBeenCalled();
  });

  it("rejects a wrong bearer token with 403 when production", async () => {
    const getEdition = vi.fn(async () => edition());
    const handle = createRefreshHandler({ service: { getEdition }, env: prodEnv("s3cr3t") });

    const res = await handle(mockRequest({ Authorization: "Bearer nope" }));
    expect(res.status).toBe(403);
    expect(getEdition).not.toHaveBeenCalled();
  });

  it("refreshes with the correct x-news-refresh-token in production", async () => {
    const getEdition = vi.fn(async () => edition());
    const handle = createRefreshHandler({ service: { getEdition }, env: prodEnv("s3cr3t") });

    const res = await handle(mockRequest({ "x-news-refresh-token": "s3cr3t" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(getEdition).toHaveBeenCalledWith({ force: true, language: "en" });
  });

  it("refreshes with the correct bearer token in production", async () => {
    const getEdition = vi.fn(async () => edition());
    const handle = createRefreshHandler({ service: { getEdition }, env: prodEnv("s3cr3t") });

    const res = await handle(mockRequest({ Authorization: "Bearer s3cr3t" }));
    expect(res.status).toBe(200);
    expect(getEdition).toHaveBeenCalledWith({ force: true, language: "en" });
  });

  it("treats GET identically to POST when authorized", async () => {
    const getEdition = vi.fn(async () => edition());
    const handle = createRefreshHandler({ service: { getEdition }, env: prodEnv("s3cr3t") });

    const res = await handle(
      { method: "GET", headers: new Headers({ "x-news-refresh-token": "s3cr3t" }) } as unknown as NextRequest
    );
    expect(res.status).toBe(200);
    expect(getEdition).toHaveBeenCalled();
  });

  it("keeps the developer-friendly open refresh when not configured outside production", async () => {
    const getEdition = vi.fn(async () => edition());
    const handle = createRefreshHandler({
      service: { getEdition },
      env: { NODE_ENV: "development" },
    });

    const res = await handle(mockRequest({}));
    expect(res.status).toBe(200);
    expect(getEdition).toHaveBeenCalledWith({ force: true, language: "en" });
  });
});