import { ConfirmationRequiredError } from "./errors.js";
import type { AccountConfig } from "./types.js";

export function assertSendAllowed(account: AccountConfig): void {
  if (!account.automationPolicy.allowSend) {
    throw new ConfirmationRequiredError(`Account ${account.id} is configured to block autonomous sends.`);
  }
}

export function assertMutationAllowed(account: AccountConfig): void {
  if (!account.automationPolicy.allowMutations) {
    throw new ConfirmationRequiredError(`Account ${account.id} is configured to block autonomous mailbox mutations.`);
  }
}

export function requiresDeleteConfirmation(account: AccountConfig): boolean {
  return !account.automationPolicy.allowDelete;
}
