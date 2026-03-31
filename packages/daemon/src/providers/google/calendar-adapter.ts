import type { AccountConfig, CalendarSummary, EventSummary, OAuthAuthMaterial } from "@iomancer/mail-agent-shared";
import { GoogleApiClient } from "./client.js";

type GoogleCalendarListResponse = {
  items?: Array<{
    id: string;
    summary?: string;
    description?: string;
  }>;
};

type GoogleEventsResponse = {
  items?: Array<{
    id: string;
    summary?: string;
    description?: string;
    location?: string;
    start?: { dateTime?: string; date?: string };
    end?: { dateTime?: string; date?: string };
  }>;
};

export class GoogleCalendarAdapter {
  private readonly client: GoogleApiClient;

  constructor(
    private readonly account: AccountConfig,
    auth: OAuthAuthMaterial
  ) {
    this.client = new GoogleApiClient(account, auth);
  }

  private get calendarBaseUrl(): string {
    return this.account.google?.calendarBaseUrl ?? "https://www.googleapis.com/calendar/v3";
  }

  async listCalendars(): Promise<CalendarSummary[]> {
    const response = await this.client.requestJson<GoogleCalendarListResponse>(this.calendarBaseUrl, "users/me/calendarList");
    return (response.items ?? []).map((calendar) => ({
      id: calendar.id,
      name: calendar.summary ?? calendar.id,
      description: calendar.description
    }));
  }

  async getEvents(options: { start: string; end: string; calendarId?: string }): Promise<EventSummary[]> {
    const calendars = options.calendarId
      ? [{ id: options.calendarId, name: options.calendarId }]
      : await this.listCalendars();

    const eventLists = await Promise.all(
      calendars.map(async (calendar) => {
        try {
          const response = await this.client.requestJson<GoogleEventsResponse>(
            this.calendarBaseUrl,
            `calendars/${encodeURIComponent(calendar.id)}/events`,
            {
              query: {
                timeMin: options.start,
                timeMax: options.end,
                singleEvents: true,
                orderBy: "startTime"
              }
            }
          );

          return (response.items ?? []).map((event) => ({
            id: event.id,
            calendarId: calendar.id,
            calendarName: calendar.name,
            title: event.summary ?? "(untitled event)",
            start: event.start?.dateTime ?? event.start?.date ?? "",
            end: event.end?.dateTime ?? event.end?.date ?? "",
            location: event.location,
            description: event.description
          }));
        } catch (error) {
          if (options.calendarId) {
            throw error;
          }
          return [];
        }
      })
    );

    return eventLists.flat().sort((left, right) => left.start.localeCompare(right.start));
  }
}
