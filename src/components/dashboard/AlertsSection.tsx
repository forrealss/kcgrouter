import {
  ArrowRightIcon,
  ArrowUpCircleIcon,
  ShieldAlertIcon,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { EncryptionHealthReport } from "@/hooks/useEncryptionHealth";
import { useRouter } from "@/hooks/useRouter";
import { numFmt } from "@/lib/dashboard-format";

interface AlertsSectionProps {
  encryptionHealth: EncryptionHealthReport | null;
  version: {
    current: string | null;
    latest: string | null;
    updateAvailable: boolean;
    updateCommand: string;
  };
}

/**
 * Critical, page-level alerts. Encryption mismatch is a serious condition
 * (stored credentials can no longer be decrypted) and gets non-dismissible,
 * high-contrast treatment. A pending update is informational and stays
 * quiet by comparison. Renders nothing when there's nothing to say.
 */
export function AlertsSection({
  encryptionHealth,
  version,
}: AlertsSectionProps) {
  const { navigate } = useRouter();
  const hasMismatch = encryptionHealth?.mismatch ?? false;

  if (!hasMismatch && !version.updateAvailable) return null;

  return (
    <div className="flex flex-col gap-3">
      {hasMismatch && encryptionHealth ? (
        <Alert variant="destructive">
          <ShieldAlertIcon />
          <AlertTitle>Encryption key mismatch</AlertTitle>
          <AlertDescription className="gap-2">
            <p>
              {numFmt.format(encryptionHealth.undecryptable)} of{" "}
              {numFmt.format(encryptionHealth.checked)} stored secrets can no
              longer be decrypted ({encryptionHealth.accounts.undecryptable}/
              {encryptionHealth.accounts.checked} accounts,{" "}
              {encryptionHealth.apiKeys.undecryptable}/
              {encryptionHealth.apiKeys.checked} API keys). Requests through
              those credentials will fail until they are re-entered.
            </p>
            <Button
              variant="destructive"
              size="sm"
              className="mt-1"
              onClick={() => navigate("/settings")}
            >
              Fix in Settings <ArrowRightIcon className="size-3.5" />
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {version.updateAvailable ? (
        <Alert className="flex-row items-center gap-3 border-border bg-muted/40 px-4 py-2.5">
          <ArrowUpCircleIcon className="size-4 text-chart-4" />
          <AlertDescription className="col-start-2 flex flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-foreground/90">
            <span>
              Update available —{" "}
              <span className="font-mono">{version.current}</span> →{" "}
              <span className="font-mono font-medium text-foreground">
                {version.latest}
              </span>
            </span>
            <code className="ml-auto rounded-md bg-secondary px-2 py-1 font-mono text-xs text-secondary-foreground">
              {version.updateCommand}
            </code>
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
