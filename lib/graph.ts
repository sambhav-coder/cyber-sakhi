/**
 * Investigation graph — builds a lightweight entity-relation view from a
 * finished `EmailAnalysisResult`. Pure, deterministic, no side-effects.
 *
 * Nodes represent concrete entities (IP addresses, domains, URLs, MX/NS
 * servers, brands targeted, the registrar if RDAP was queried, and the
 * analysis email itself).  Edges describe how they relate.
 *
 * The graph is consumed by the case-management API and the forensic report
 * builder; no live UI rendering is assumed.
 */

import type { EmailAnalysisResult } from "./emailTypes";

export type GraphNodeKind =
  | "email"
  | "ip"
  | "domain"
  | "url"
  | "ns"
  | "mx"
  | "registrar"
  | "brand"
  | "threatlist";

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  label: string;
  meta?: Record<string, unknown>;
}

export type GraphEdgeKind =
  | "sent_from_ip"
  | "from_domain"
  | "reply_to"
  | "return_path"
  | "mx_for"
  | "ns_for"
  | "links_to"
  | "registered_by"
  | "impersonates"
  | "threat_intel_hit"
  | "associated";

export interface GraphEdge {
  source: string;
  target: string;
  kind: GraphEdgeKind;
}

export interface InvestigationGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

const emailId = (r: EmailAnalysisResult) => `email:${r.id}`;
const domainId = (d: string) => `domain:${d.toLowerCase()}`;
const ipId = (ip: string) => `ip:${ip}`;
const urlId = (u: string) => `url:${hash16(u)}`;
const registrarId = (r: string) => `registrar:${r}`;
const brandId = (b: string) => `brand:${b.toLowerCase()}`;

function hash16(input: string): string {
  // deterministic pseudo-hash for node IDs (not cryptographic)
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(36).padStart(6, "0");
}

function addNode(nodes: Map<string, GraphNode>, n: GraphNode): GraphNode {
  const existing = nodes.get(n.id);
  if (existing) return existing;
  nodes.set(n.id, n);
  return n;
}

function addEdge(edges: GraphEdge[], e: GraphEdge): void {
  if (edges.some((x) => x.source === e.source && x.target === e.target && x.kind === e.kind))
    return;
  edges.push(e);
}

function extractDomainFromHeader(raw: string | undefined): string | null {
  if (!raw) return null;
  const m = /@([^>@]+)>?$/.exec(raw.trim());
  return m ? m[1].toLowerCase() : null;
}

/**
 * Build the investigation graph from a completed forensic analysis.
 * All data comes directly from `EmailAnalysisResult`; no fetching is done.
 */
export function buildInvestigationGraph(r: EmailAnalysisResult): InvestigationGraph {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];

  // Email root node
  addNode(nodes, { id: emailId(r), kind: "email", label: r.headers.subject ?? r.id });

  // Sender domain
  if (r.senderDomain) {
    const dId = domainId(r.senderDomain);
    addNode(nodes, {
      id: dId,
      kind: "domain",
      label: r.senderDomain,
      meta: {
        ...(r.rdap && {
          created: r.rdap.created,
          ageDays: r.rdap.ageDays,
          registrar: r.rdap.registrar,
          registrantName: r.rdap.registrantName,
        }),
      },
    });
    addEdge(edges, { source: emailId(r), target: dId, kind: "from_domain" });
  }

  // Reply-To / Return-Path domains (distinct from From domain)
  for (const hdr of ["replyTo", "returnPath"] as const) {
    const d = extractDomainFromHeader(r.headers[hdr]);
    if (d && d !== r.senderDomain) {
      const id = domainId(d);
      addNode(nodes, { id, kind: "domain", label: d });
      addEdge(edges, {
        source: emailId(r),
        target: id,
        kind: hdr === "replyTo" ? "reply_to" : "return_path",
      });
    }
  }

  // Originating IP
  if (r.originatingIP) {
    const ipn = ipId(r.originatingIP);
    addNode(nodes, {
      id: ipn,
      kind: "ip",
      label: r.originatingIP,
      meta: {
        ...(r.ipIntelligence && {
          country: r.ipIntelligence.country,
          organization: r.ipIntelligence.organization,
          asn: r.ipIntelligence.asn,
        }),
        ...(r.ipProxy && { proxy: r.ipProxy.kind }),
      },
    });
    addEdge(edges, { source: emailId(r), target: ipn, kind: "sent_from_ip" });
  }

  // MX / NS servers
  if (r.domainIntelligence) {
    for (const mx of r.domainIntelligence.mx ?? []) {
      const mxId = `mx:${mx.toLowerCase()}`;
      addNode(nodes, { id: mxId, kind: "mx", label: mx });
      if (r.senderDomain)
        addEdge(edges, { source: domainId(r.senderDomain), target: mxId, kind: "mx_for" });
    }
    for (const ns of r.domainIntelligence.ns ?? []) {
      const nsId = `ns:${ns.toLowerCase()}`;
      addNode(nodes, { id: nsId, kind: "ns", label: ns });
      if (r.senderDomain)
        addEdge(edges, { source: domainId(r.senderDomain), target: nsId, kind: "ns_for" });
    }
  }

  // Registrar
  if (r.rdap?.registrar) {
    const regId = registrarId(r.rdap.registrar);
    addNode(nodes, { id: regId, kind: "registrar", label: r.rdap.registrar });
    if (r.senderDomain)
      addEdge(edges, { source: domainId(r.senderDomain), target: regId, kind: "registered_by" });
  }

  // Brands impersonated
  for (const brand of r.spoofing?.brandsLikelyImpersonated ?? []) {
    const bId = brandId(brand);
    addNode(nodes, { id: bId, kind: "brand", label: brand });
    if (r.senderDomain)
      addEdge(edges, { source: domainId(r.senderDomain), target: bId, kind: "impersonates" });
  }

  // URLs extracted from the body
  for (const u of (r.urlRisk ?? []).map((x) => x.url).slice(0, 20)) {
    const uId = urlId(u);
    addNode(nodes, { id: uId, kind: "url", label: u });
    addEdge(edges, { source: emailId(r), target: uId, kind: "links_to" });
    const urlDomain = extractDomainFromHeader(`<${u}>`) ?? null;
    if (urlDomain) {
      const dId = domainId(urlDomain);
      addNode(nodes, { id: dId, kind: "domain", label: urlDomain });
      addEdge(edges, { source: uId, target: dId, kind: "associated" });
    }
  }

  // Threat-intel blocklist hits
  if (r.threatIntel) {
    for (const entry of r.threatIntel.ip?.results ?? []) {
      if (!entry.listed) continue;
      const tiId = `threatlist:${entry.source}`;
      addNode(nodes, { id: tiId, kind: "threatlist", label: entry.source });
      if (r.originatingIP)
        addEdge(edges, { source: ipId(r.originatingIP), target: tiId, kind: "threat_intel_hit" });
    }
    for (const entry of r.threatIntel.domain?.results ?? []) {
      if (!entry.listed) continue;
      const tiId = `threatlist:${entry.source}`;
      addNode(nodes, { id: tiId, kind: "threatlist", label: entry.source });
      if (r.senderDomain)
        addEdge(edges, {
          source: domainId(r.senderDomain),
          target: tiId,
          kind: "threat_intel_hit",
        });
    }
  }

  return { nodes: Array.from(nodes.values()), edges };
}