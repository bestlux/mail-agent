import type { AccountConfig, CalendarSummary, EventSummary, FastmailAuthMaterial } from "@iomancer/mail-agent-shared";
import { FastmailDavClient } from "./dav-client.js";

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isForbiddenDavError(error: unknown): boolean {
  return error instanceof Error && /\b403\b/.test(error.message);
}

function normalizeSimpleUtcDateTime(value: string): string {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value);
  if (!match) {
    return value;
  }

  const [, year, month, day, hour, minute, second] = match;
  return `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
}

function parseIcsEvents(calendarId: string, calendarName: string, ics: string): EventSummary[] {
  const chunks = ics.split("BEGIN:VEVENT").slice(1);
  return chunks.map((chunk, index) => {
    const full = `BEGIN:VEVENT${chunk}`;
    const lines = full.split(/\r?\n/);
    const map = new Map<string, string>();

    for (const line of lines) {
      const separator = line.indexOf(":");
      if (separator === -1) {
        continue;
      }
      const key = line.slice(0, separator).split(";")[0] ?? "";
      const value = line.slice(separator + 1);
      map.set(key, value);
    }

    return {
      id: map.get("UID") ?? `${calendarId}-${index}`,
      calendarId,
      calendarName,
      title: map.get("SUMMARY") ?? "(untitled)",
      start: normalizeSimpleUtcDateTime(map.get("DTSTART") ?? ""),
      end: normalizeSimpleUtcDateTime(map.get("DTEND") ?? ""),
      location: map.get("LOCATION"),
      description: map.get("DESCRIPTION")
    };
  });
}

export class FastmailCalendarAdapter {
  private readonly client: FastmailDavClient;

  constructor(account: AccountConfig, auth: FastmailAuthMaterial) {
    this.client = new FastmailDavClient(account.fastmail?.caldavUrl ?? "https://caldav.fastmail.com", {
      username: auth.username,
      password: auth.davPassword
    });
  }

  async listCalendars(): Promise<CalendarSummary[]> {
    const homes = await this.client.discoverHomes("caldav");
    const responses = await this.client.propfind(homes.calendarHomeSetUrl, `<?xml version="1.0" encoding="utf-8" ?>
<d:propfind xmlns:d="DAV:" xmlns:cs="http://calendarserver.org/ns/" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:displayname />
    <cs:getctag />
    <c:calendar-description />
    <d:resourcetype />
  </d:prop>
</d:propfind>`);

    return responses
      .filter((entry) => entry.href !== homes.calendarHomeSetUrl)
      .filter((entry) => JSON.stringify(entry.props.resourcetype ?? "").includes("calendar"))
      .map((entry) => ({
        id: entry.href,
        name: asString(entry.props.displayname) ?? entry.href,
        description: asString(entry.props["calendar-description"])
      }));
  }

  async getEvents(options: { start: string; end: string; calendarId?: string }): Promise<EventSummary[]> {
    const calendars = await this.listCalendars();
    const scoped = options.calendarId ? calendars.filter((calendar) => calendar.id === options.calendarId) : calendars;
    const settled = await Promise.allSettled(
      scoped.map(async (calendar) => {
        const responses = await this.client.report(calendar.id, `<?xml version="1.0" encoding="utf-8" ?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag />
    <c:calendar-data />
  </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT">
        <c:time-range start="${options.start}" end="${options.end}" />
      </c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`);

        return responses.flatMap((entry) => {
          const ics = asString(entry.props["calendar-data"]);
          if (!ics) {
            return [];
          }
          return parseIcsEvents(calendar.id, calendar.name, ics);
        });
      })
    );

    const events: EventSummary[] = [];
    for (const result of settled) {
      if (result.status === "fulfilled") {
        events.push(...result.value);
        continue;
      }

      if (options.calendarId || !isForbiddenDavError(result.reason)) {
        throw result.reason;
      }
    }

    return events;
  }
}
