import { AuthError } from "@mail-agent/shared";

const MAIL_CAPABILITY = "urn:ietf:params:jmap:mail";
const SUBMISSION_CAPABILITY = "urn:ietf:params:jmap:submission";

export type JmapSession = {
  apiUrl: string;
  primaryAccounts: Record<string, string>;
};

type JmapInvocation = [string, Record<string, unknown>, string];

type JmapResponse = {
  methodResponses: [string, Record<string, unknown>, string][];
};

export class FastmailJmapClient {
  private session?: JmapSession;

  constructor(
    private readonly sessionUrl: string,
    private readonly accessToken: string
  ) {}

  async getSession(): Promise<JmapSession> {
    if (this.session) {
      return this.session;
    }

    const response = await fetch(this.sessionUrl, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new AuthError(`Fastmail JMAP session failed: ${response.status} ${response.statusText}`);
    }

    const json = (await response.json()) as JmapSession;
    this.session = json;
    return json;
  }

  async call(invocations: JmapInvocation[]): Promise<JmapResponse["methodResponses"]> {
    const session = await this.getSession();
    const using = [
      "urn:ietf:params:jmap:core",
      MAIL_CAPABILITY,
      SUBMISSION_CAPABILITY
    ];
    const response = await fetch(session.apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        using,
        methodCalls: invocations
      })
    });

    if (!response.ok) {
      throw new Error(`Fastmail JMAP call failed: ${response.status} ${response.statusText}`);
    }

    const json = (await response.json()) as JmapResponse;
    return json.methodResponses;
  }

  async callSingle(method: string, payload: Record<string, unknown>, tag = "0"): Promise<Record<string, unknown>> {
    const [response] = await this.call([[method, payload, tag]]);

    if (!response) {
      throw new Error(`No JMAP response returned for ${method}`);
    }

    const [name, body] = response;
    if (name.endsWith("/error")) {
      throw new Error(`${method} failed: ${JSON.stringify(body)}`);
    }

    return body;
  }

  async getMailAccountId(): Promise<string> {
    const session = await this.getSession();
    const accountId = session.primaryAccounts[MAIL_CAPABILITY];

    if (!accountId) {
      throw new AuthError("Fastmail session is missing a primary mail account.");
    }

    return accountId;
  }

  async getSubmissionAccountId(): Promise<string> {
    const session = await this.getSession();
    const accountId = session.primaryAccounts[SUBMISSION_CAPABILITY];

    if (!accountId) {
      throw new AuthError("Fastmail session is missing a submission account.");
    }

    return accountId;
  }
}
