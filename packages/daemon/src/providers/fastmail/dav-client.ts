import { XMLParser } from "fast-xml-parser";

type DavCredentials = {
  username: string;
  password: string;
};

type DavResponse = {
  href: string;
  props: Record<string, unknown>;
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  removeNSPrefix: true
});

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function encodeBasicAuth(credentials: DavCredentials): string {
  return Buffer.from(`${credentials.username}:${credentials.password}`, "utf8").toString("base64");
}

export class FastmailDavClient {
  constructor(
    private readonly baseUrl: string,
    private readonly credentials: DavCredentials
  ) {}

  private async request(url: string, options: RequestInit): Promise<string> {
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Basic ${encodeBasicAuth(this.credentials)}`,
        ...options.headers
      }
    });

    if (!response.ok) {
      throw new Error(`DAV request failed: ${response.status} ${response.statusText}`);
    }

    return await response.text();
  }

  async propfind(pathname: string, body: string, depth = "1"): Promise<DavResponse[]> {
    const xml = await this.request(new URL(pathname, this.baseUrl).toString(), {
      method: "PROPFIND",
      headers: {
        Depth: depth,
        "Content-Type": "application/xml; charset=utf-8"
      },
      body
    });

    return parseMultiStatus(xml);
  }

  async report(pathname: string, body: string, depth = "1"): Promise<DavResponse[]> {
    const xml = await this.request(new URL(pathname, this.baseUrl).toString(), {
      method: "REPORT",
      headers: {
        Depth: depth,
        "Content-Type": "application/xml; charset=utf-8"
      },
      body
    });

    return parseMultiStatus(xml);
  }
}

function parseMultiStatus(xml: string): DavResponse[] {
  const parsed = parser.parse(xml) as { multistatus?: { response?: unknown } };
  const responses = asArray(parsed.multistatus?.response);

  return responses.flatMap((response) => {
    if (!response || typeof response !== "object") {
      return [];
    }

    const href = (response as Record<string, unknown>).href;
    const propstats = asArray((response as Record<string, unknown>).propstat);
    const props = Object.assign({}, ...propstats.map((propstat) => {
      if (!propstat || typeof propstat !== "object") {
        return {};
      }
      return ((propstat as Record<string, unknown>).prop ?? {}) as Record<string, unknown>;
    }));

    if (typeof href !== "string") {
      return [];
    }

    return [{ href, props }];
  });
}
