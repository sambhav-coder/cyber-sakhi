import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { extractTextFromFile, fileKindLabel } from "@/lib/documents/extract";

/**
 * POST /api/chat/upload  (multipart form-data, field "file")
 *
 * Authentication required. Returns dependency-free extraction of the uploaded
 * document. The extracted text belongs to the uploader and is returned to the
 * client so it can be attached to a Sakhi conversation; it is never persisted
 * as long-term memory.
 */
export const maxDuration = 30;

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "A file is required." }, { status: 400 });
    }

    if (file.size <= 0) {
      return NextResponse.json({ error: "The file is empty." }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "File is too large (max 5 MB for text analysis)." },
        { status: 413 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const extracted = extractTextFromFile({
      name: file.name,
      mimeType: file.type,
      buffer,
    });

    return NextResponse.json({
      file: {
        name: extracted.name,
        size: extracted.size,
        mimeType: extracted.mimeType || "application/octet-stream",
        kind: extracted.kind,
        kindLabel: fileKindLabel(extracted.kind),
        content: extracted.content,
        note: extracted.note,
        contentLength: extracted.contentLength,
        preview: extracted.preview,
      },
      extracted: extracted.content !== null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? "Document processing failed: " + error.message
            : "Document processing failed.",
      },
      { status: 500 }
    );
  }
}