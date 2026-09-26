# Data Coverage Report — 2026-09-25 (PART 1)

Execution date (UTC): 2026-09-25. Requested recent window: **2026-06-27T00:00:00Z → 2026-09-25T23:59:59Z** (90 days).
No source below is reported as a complete 90-day dataset unless its actual range covers it. None does.

## Per-source actuals (all timestamps UTC)

| source_name | source_type | requested range | actual_source_start | actual_source_end | records | unique | dups | rejected | missing-field notes | license/attribution | historical status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| cyber-sakhi cases (Supabase, live) | production | 90d | 2026-09-14T08:33:28Z | 2026-09-25T11:05:20Z | 22 | 22 | 0 | 0 | threat/risk/state/district/source ALL NULL (22/22); all status NEW | internal | 11 days, sparse triage |
| cyber-sakhi audit_logs (live) | production | 90d | 2026-09-21T10:30:03Z | 2026-09-25T12:19:12Z | 52 | n/a | 0 | 0 | — | internal | 4 days |
| urlhaus csv_recent | external IOC | 90d | 2026-08-26T00:49:17Z | 2026-09-25T14:28:07Z | 14,464 | 14,464 | 0 | 0 | confidence: none provided (14,464); all threat=malware_download | abuse.ch ToU | **partial: ~30 days, not 90** |
| tweetfeed week (api.tweetfeed.live/v1/week) | external IOC | 90d | 2026-09-19T00:05:54Z | 2026-09-25T14:12:56Z | 890 obs / 847 unique | 847 | 43 recurrences (last_seen extended) | 0 | status/confidence: none provided; tags noisy | community reporters via TweetFeed | **7-day rolling retention only** |
| feodo ipblocklist (+recommended) | external IOC | 90d | feed header 2026-03-04T14:28:39Z (stale) | observed 2026-09-25 | 5 unique | 5 | 1 overlap | 0 | first_seen: none in feed | abuse.ch ToU | **stale ~6 months, negligible value** |
| urlhaus v2 full export (keyed) | external IOC | 90d | — | — | 0 | 0 | 0 | 0 | n/a | n/a | **FAILED: pasted key rejected (401 Invalid auth token); needs portal reissue** |
| threatfox | external IOC | 90d | — | — | 0 | 0 | 0 | 0 | n/a | n/a | **PENDING: no auth_key provisioned** |
| reversinglabs file reputation | enrichment | n/a | — | — | 0 | 0 | 0 | 0 | n/a | n/a | **FAILED: token-only Basic rejected (401×2) against documented malware_presence endpoint; needs username+password pair** |
| x-api user timeline | external IOC | 7d | — | — | 0 | 0 | 0 | 0 | n/a | n/a | **FAILED: Bearer rejected (401); needs credential/tier check** |
| uci phishing-websites-327 | research | n/a | ~2012 | ~2015 | 11,055 | 11,055 | 0 | 0 | no URLs, no dates per row | CC BY 4.0, DOI 10.24432/C51W2X | **historical benchmark only** |
| tranco top-15k | research (ML legitimacy proxy) | n/a | snapshot 2026-09-25, rows undated | snapshot 2026-09-25 | 14,999 | 14,999 | 0 | 0 (1 host overlap removed) | no per-row dates | Tranco research use | snapshot only |
| datameet districts census-2011 | boundary geometry | n/a | 2011 vintage | 2011 vintage | 641 polygons | 641 | 0 | 0 | Telangana absent; pre-delimitation NE/J&K | CC BY 4.0, DataMeet | static vintage |

Ingestion: batch `ext-20260925-manual01`, 15,316 records + 44 in-batch recurrences + 0 rejects + 2 cross-source overlaps (kept separate).
Keys used only server-side from `.env.local`; values never logged, never in the browser, never committed.
