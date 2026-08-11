import { KeySquareIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useEncryptionHealth } from "@/hooks/useEncryptionHealth";

/**
 * Warns when the current ENCRYPTION_KEY cannot decrypt stored credentials.
 * This happens when accounts/API keys were created under a different key
 * (e.g. dev vs production), and shows up as failing connection tests and
 * 500 errors on the test endpoints.
 */
export function EncryptionMismatchAlert() {
  const { health, isLoading } = useEncryptionHealth();

  if (isLoading || !health || !health.mismatch) return null;

  const accountsPart =
    health.accounts.undecryptable > 0
      ? `${health.accounts.undecryptable}/${health.accounts.checked} provider account(s)`
      : null;
  const apiKeysPart =
    health.apiKeys.undecryptable > 0
      ? `${health.apiKeys.undecryptable}/${health.apiKeys.checked} API key(s)`
      : null;
  const affected = [accountsPart, apiKeysPart].filter(Boolean).join(" and ");

  return (
    <Alert variant="destructive">
      <KeySquareIcon />
      <AlertTitle>Encryption key mismatch detected</AlertTitle>
      <AlertDescription className="flex flex-col gap-2">
        <p>
          The current ENCRYPTION_KEY cannot decrypt {health.undecryptable}/
          {health.checked} stored credential
          {health.undecryptable === 1 ? "" : "s"}
          {affected ? ` (${affected})` : ""}. This usually means the key used
          now differs from the one at creation time — for example, dev and
          production environments with separate secrets — or a stored value is
          corrupt.
        </p>
        <p>
          Connection tests and routed requests for affected accounts will fail
          until the original key is restored or the credentials are re-created.
        </p>
      </AlertDescription>
    </Alert>
  );
}
