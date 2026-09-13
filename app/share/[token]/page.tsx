import { Noto_Sans } from "next/font/google";

const noto = Noto_Sans({ subsets: ["latin"], weight: ["400", "600", "700"] });

interface ShareMessage {
  role: string;
  text: string;
  createdAt: string;
}

interface SharePayload {
  title: string;
  createdAt: string;
  expiresAt: string;
  messages: ShareMessage[];
}

async function loadShare(token: string): Promise<SharePayload | null> {
  try {
    const res = await fetch(
      `${process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/api/chat/share/${encodeURIComponent(token)}`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    return (await res.json()) as SharePayload;
  } catch {
    return null;
  }
}

export default async function SharePage({
  params,
}: {
  params: { token: string };
}) {
  const data = await loadShare(params.token);

  if (!data) {
    return (
      <div className="min-h-screen bg-[#07070f] text-slate-300 flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-lg font-bold text-white">Share unavailable</h1>
          <p className="text-sm text-slate-400">
            This share does not exist, was revoked, or has expired.
          </p>
        </div>
      </div>
    );
  }

  return (
    <main
      className={`${noto.className} min-h-screen bg-[#07070f] text-slate-300 flex flex-col`}
    >
      <header className="px-6 py-5 border-b border-slate-800/80 bg-slate-950/60">
        <div className="max-w-2xl mx-auto space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-emergency-300">
            Shared conversation
          </p>
          <h1 className="text-lg font-bold text-white">{data.title}</h1>
          <p className="text-[11px] text-slate-500">
            Created {new Date(data.createdAt).toLocaleDateString()} · Expires{" "}
            {new Date(data.expiresAt).toLocaleDateString()}
          </p>
        </div>
      </header>

      <div className="flex-1 w-full max-w-2xl mx-auto px-6 py-6 space-y-4">
        {data.messages.length === 0 && (
          <p className="text-sm text-slate-500 text-center py-10">
            This conversation has no messages yet.{" "}
            <span className="text-emergency-300">⚠</span> Message text only is
            shared — attachment content, case data and evidence are never exposed.
          </p>
        )}
        {data.messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                m.role === "user"
                  ? "bg-emergency-900/70 text-white rounded-br-none"
                  : "bg-slate-900 border border-slate-800 rounded-bl-none"
              }`}
            >
              <p className="whitespace-pre-line">{m.text}</p>
              <p className="mt-2 text-[10px] opacity-60">
                {m.role === "user" ? "You" : "Sakhi"} ·{" "}
                {new Date(m.createdAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </div>
        ))}
      </div>

      <footer className="px-6 py-5 text-center text-[10px] text-slate-600">
        Shared from Cyber Sakhi · Read-only snapshot · Attachment, case and
        evidence content are never included.
      </footer>
    </main>
  );
}