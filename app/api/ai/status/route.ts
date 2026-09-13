import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import {
  listSakhiReasoningProviders,
  getSakhiReasoningProvider,
} from "@/lib/sakhiReasoning";

/**
 * GET /api/ai/status — authenticated provider report.
 *
 * Returns the reasoning providers and which one is currently intended for the
 * next reply. Never exposes keys, endpoints or model internals.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const active = getSakhiReasoningProvider();
    return NextResponse.json({
      active: {
        key: active.key,
        label: active.label,
        status: active.status,
      },
      providers: listSakhiReasoningProviders().map((p) => ({
        key: p.key,
        label: p.label,
        kind: p.kind,
        status: p.status,
        note: p.note,
      })),
    });
  } catch {
    return NextResponse.json(
      { error: "AI status service error." },
      { status: 500 }
    );
  }
}