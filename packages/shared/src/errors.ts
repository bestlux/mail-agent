export class MailAgentError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export class NotSupportedError extends MailAgentError {
  constructor(message: string) {
    super("not_supported", message);
  }
}

export class ConfigError extends MailAgentError {
  constructor(message: string) {
    super("config_error", message);
  }
}

export class AuthError extends MailAgentError {
  constructor(message: string) {
    super("auth_error", message);
  }
}

export class ConfirmationRequiredError extends MailAgentError {
  constructor(message: string) {
    super("confirmation_required", message);
  }
}
