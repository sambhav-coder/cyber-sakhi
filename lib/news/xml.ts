export interface XmlNode {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
  mdash: "\u2014",
  ndash: "\u2013",
  hellip: "\u2026",
  rsquo: "\u2019",
  lsquo: "\u2018",
  rdquo: "\u201d",
  ldquo: "\u201c",
  times: "\u00d7",
  middot: "\u00b7",
  copy: "\u00a9",
  reg: "\u00ae",
  trade: "\u2122",
  eacute: "\u00e9",
  egrave: "\u00e8",
  agrave: "\u00e0",
  aacute: "\u00e1",
  iacute: "\u00ed",
  oacute: "\u00f3",
  uacute: "\u00fa",
  ntilde: "\u00f1",
  cent: "\u00a2",
  pound: "\u00a3",
  yen: "\u00a5",
  euro: "\u20ac",
};

export function decodeEntities(input: string): string {
  if (!input || input.indexOf("&") === -1) return input;
  return input.replace(
    /&(#[xX][0-9a-fA-F]{1,6}|#[0-9]{1,7}|[a-zA-Z][a-zA-Z0-9]{1,31});/g,
    (match, entity: string) => {
      if (entity.startsWith("#x") || entity.startsWith("#X")) {
        const code = Number.parseInt(entity.slice(2), 16);
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      }
      if (entity.startsWith("#")) {
        const code = Number.parseInt(entity.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      }
      return NAMED_ENTITIES[entity] ?? match;
    }
  );
}

function isWhitespaceChar(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
}

function parseAttributes(segment: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re =
    /([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')|([^\s=/>]+)\s*=\s*([^\s/>]+)|([^\s=/>]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(segment)) !== null) {
    const name = m[1] || m[5] || m[7];
    if (!name) continue;
    const value = m[3] ?? m[4] ?? m[6] ?? "";
    attrs[name] = decodeEntities(value);
  }
  return attrs;
}

export function parseXml(input: string): XmlNode | null {
  let i = 0;
  const len = input.length;

  const skipPrologAndComments = (): void => {
    for (;;) {
      while (i < len && isWhitespaceChar(input[i])) i += 1;
      if (input.startsWith("<?", i)) {
        const end = input.indexOf("?>", i);
        i = end === -1 ? len : end + 2;
        continue;
      }
      if (input.startsWith("<!--", i)) {
        const end = input.indexOf("-->", i);
        i = end === -1 ? len : end + 3;
        continue;
      }
      if (input.startsWith("<!DOCTYPE", i) || input.startsWith("<!doctype", i)) {
        const re = /^<!DOCTYPE[^>]*>/i;
        const rest = input.slice(i);
        const m = re.exec(rest);
        if (m) {
          i += m[0].length;
          continue;
        }
        const end = rest.indexOf(">");
        i = end === -1 ? len : i + end + 1;
        continue;
      }
      break;
    }
  };

  const parseElement = (): XmlNode | null => {
    if (input[i] !== "<") return null;
    const openMatch = /^<\s*([A-Za-z_][\w:.-]*)/.exec(input.slice(i));
    if (!openMatch) return null;
    const name = openMatch[1];
    i += openMatch[0].length;

    let attrSegment = "";
    let selfClosing = false;
    while (i < len) {
      if (input[i] === "/" && input[i + 1] === ">") {
        selfClosing = true;
        i += 2;
        break;
      }
      if (input[i] === ">") {
        i += 1;
        break;
      }
      attrSegment += input[i];
      i += 1;
    }
    const node: XmlNode = {
      name,
      attrs: attrSegment.trim() ? parseAttributes(attrSegment.trim()) : {},
      children: [],
      text: "",
    };
    if (selfClosing) return node;

    while (i < len) {
      if (input.startsWith("</", i)) {
        const closeMatch = /^<\s*\/\s*([A-Za-z_][\w:.-]*)\s*>/.exec(input.slice(i));
        if (closeMatch) {
          i += closeMatch[0].length;
          return node;
        }
        const end = input.indexOf(">", i);
        i = end === -1 ? len : end + 1;
        continue;
      }
      if (input.startsWith("<!--", i)) {
        const end = input.indexOf("-->", i);
        i = end === -1 ? len : end + 3;
        continue;
      }
      if (input.startsWith("<![CDATA[", i)) {
        const end = input.indexOf("]]>", i);
        const raw = end === -1 ? input.slice(i + 9, len) : input.slice(i + 9, end);
        node.text += raw;
        i = end === -1 ? len : end + 3;
        continue;
      }
      if (input.startsWith("<?", i)) {
        const end = input.indexOf("?>", i);
        i = end === -1 ? len : end + 2;
        continue;
      }
      if (input.startsWith("<!", i)) {
        const end = input.indexOf(">", i);
        i = end === -1 ? len : end + 1;
        continue;
      }
      if (input[i] === "<") {
        const child = parseElement();
        if (child) node.children.push(child);
        else i += 1;
        continue;
      }
      const nextLt = input.indexOf("<", i);
      const textEnd = nextLt === -1 ? len : nextLt;
      const rawText = input.slice(i, textEnd);
      if (rawText) node.text += decodeEntities(rawText);
      i = textEnd;
    }
    return node;
  };

  skipPrologAndComments();
  const root = parseElement();
  return root;
}

export function childOf(node: XmlNode | null | undefined, localName: string): XmlNode | null {
  if (!node) return null;
  return (
    node.children.find(
      (c) => c.name === localName || c.name.split(":").pop() === localName
    ) ?? null
  );
}

export function childrenOf(
  node: XmlNode | null | undefined,
  localName: string
): XmlNode[] {
  if (!node) return [];
  return node.children.filter(
    (c) => c.name === localName || c.name.split(":").pop() === localName
  );
}

export function nodeText(node: XmlNode | null | undefined): string {
  if (!node) return "";
  if (node.text && !node.children.length) return node.text.trim();
  if (node.text && node.children.length) {
    const childTexts = node.children.map((c) => nodeText(c)).filter(Boolean);
    return [node.text.trim(), ...childTexts].join(" ").trim();
  }
  if (node.children.length > 0) {
    return node.children.map((c) => nodeText(c)).filter(Boolean).join(" ").trim();
  }
  return "";
}