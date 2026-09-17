import {
  AlertCircleIcon,
  KeyRoundIcon,
  LogInIcon,
  SaveIcon,
} from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { apiClient, getApiErrorMessage } from "@/lib/api-client";
import type {
  AccountFormValues,
  AntigravityOAuthResult,
  ProviderAccount,
} from "@/types/provider";

interface AccountFormDialogProps {
  providerId: string;
  /** Transport of the provider this dialog adds an account to. */
  transport?: string;
  account?: ProviderAccount | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void | Promise<void>;
}

type OAuthPhase =
  | { kind: "idle" }
  | { kind: "awaiting-browser"; loginId: string }
  | { kind: "exchanging" }
  | { kind: "done"; result: AntigravityOAuthResult };

interface OAuthStartResponse {
  loginId: string;
  authUrl: string;
}

function getInitialValues(account?: ProviderAccount | null): AccountFormValues {
  return {
    label: account?.label ?? "",
    quotaLimitTokens: account?.quotaLimitTokens ?? null,
  };
}

export function AccountFormDialog({
  providerId,
  transport,
  account,
  open,
  onOpenChange,
  onSaved,
}: AccountFormDialogProps) {
  const isEditing = Boolean(account);
  const isAntigravity = transport === "antigravity";
  const [values, setValues] = useState<AccountFormValues>(() =>
    getInitialValues(account),
  );
  const [apiKey, setApiKey] = useState("");
  const [quotaLimit, setQuotaLimit] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- Antigravity OAuth login state ---
  const [oauthPhase, setOauthPhase] = useState<OAuthPhase>({ kind: "idle" });
  const [oauthError, setOauthError] = useState<string | null>(null);
  const waitAbort = useRef<AbortController | null>(null);
  const activeLoginId = useRef<string | null>(null);

  useEffect(() => {
    if (open) {
      const initialValues = getInitialValues(account);
      setValues(initialValues);
      setApiKey("");
      setQuotaLimit(
        initialValues.quotaLimitTokens === null
          ? ""
          : String(initialValues.quotaLimitTokens),
      );
      setError(null);
      setOauthPhase({ kind: "idle" });
      setOauthError(null);
    } else {
      // Leaving the dialog cancels any in-flight browser login.
      waitAbort.current?.abort();
      if (activeLoginId.current) {
        const loginId = activeLoginId.current;
        activeLoginId.current = null;
        void apiClient
          .delete(
            `/api/providers/antigravity/oauth/${encodeURIComponent(loginId)}`,
          )
          .catch(() => {});
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, open]);

  function handleOpenChange(nextOpen: boolean) {
    if (isSubmitting) return;
    onOpenChange(nextOpen);
  }

  async function startOAuthLogin() {
    setOauthError(null);
    try {
      const res = await apiClient.post<OAuthStartResponse>(
        "/api/providers/antigravity/oauth/start",
        {},
      );
      activeLoginId.current = res.loginId;
      setOauthPhase({ kind: "awaiting-browser", loginId: res.loginId });

      // Open the consent page, then long-poll until Google redirects back.
      window.open(res.authUrl, "_blank", "noopener");

      waitAbort.current = new AbortController();
      const controller = waitAbort.current;
      setOauthPhase({ kind: "exchanging" });
      const result = await apiClient.get<AntigravityOAuthResult>(
        `/api/providers/antigravity/oauth/wait/${encodeURIComponent(res.loginId)}`,
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      activeLoginId.current = null;
      setOauthPhase({ kind: "done", result });
      if (!values.label.trim() && result.email) {
        setValues((current) => ({
          ...current,
          label: result.email ?? current.label,
        }));
      }
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      setOauthPhase({ kind: "idle" });
      setOauthError(getApiErrorMessage(err));
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const label = values.label.trim();
    const normalizedApiKey = apiKey.trim();
    const normalizedQuotaLimit = quotaLimit.trim();
    const parsedQuotaLimit = normalizedQuotaLimit
      ? Number(normalizedQuotaLimit)
      : null;

    if (!label) {
      setError("Account label is required.");
      return;
    }

    // Antigravity accounts get their access token from the OAuth login — a
    // manual key is only needed when pasting an existing token.
    if (!isEditing && !normalizedApiKey && !isAntigravity) {
      setError("An API key is required when adding an account.");
      return;
    }

    if (
      parsedQuotaLimit !== null &&
      (!Number.isSafeInteger(parsedQuotaLimit) || parsedQuotaLimit <= 0)
    ) {
      setError("The quota limit must be a positive whole number.");
      return;
    }

    const oauthResult =
      oauthPhase.kind === "done" ? oauthPhase.result : undefined;
    const oauth = oauthResult
      ? {
          refreshToken: oauthResult.refreshToken,
          email: oauthResult.email,
          projectId: oauthResult.projectId,
          expiresIn: oauthResult.expiresIn,
        }
      : undefined;

    if (isAntigravity && !isEditing && !normalizedApiKey && !oauth) {
      setError("Complete the Google login first (or paste an access token).");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const payload: AccountFormValues & Record<string, unknown> = {
        label,
        quotaLimitTokens: parsedQuotaLimit,
        // A manually pasted key wins; otherwise the OAuth access token becomes
        // the stored credential (the server refreshes it via the refresh token).
        ...(normalizedApiKey
          ? { apiKey: normalizedApiKey }
          : oauthResult
            ? { apiKey: oauthResult.accessToken }
            : {}),
        ...(oauth ? { oauth } : {}),
      };

      if (account) {
        await apiClient.patch<ProviderAccount>(
          `/api/providers/accounts/${encodeURIComponent(account.id)}`,
          payload,
        );
      } else {
        await apiClient.post<ProviderAccount>(
          `/api/providers/${encodeURIComponent(providerId)}/accounts`,
          payload,
        );
      }

      await onSaved();
      onOpenChange(false);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError));
    } finally {
      setIsSubmitting(false);
    }
  }

  const oauthInProgress =
    oauthPhase.kind === "awaiting-browser" || oauthPhase.kind === "exchanging";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit account" : "Add account"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update this upstream account configuration."
              : "Save credentials for a new upstream account."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="account-label">Account label</FieldLabel>
              <Input
                id="account-label"
                value={values.label}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    label: event.target.value,
                  }))
                }
                disabled={isSubmitting}
                required
                autoFocus
                placeholder="Primary account"
              />
            </Field>

            {isAntigravity ? (
              <Field>
                <FieldLabel>Google account</FieldLabel>
                {oauthPhase.kind === "done" ? (
                  <div className="flex items-center gap-2 text-sm text-success">
                    <LogInIcon className="size-4" />
                    <span>
                      Logged in
                      {oauthPhase.result.email
                        ? ` as ${oauthPhase.result.email}`
                        : ""}
                      {oauthPhase.result.projectId
                        ? ` · project ${oauthPhase.result.projectId}`
                        : ""}
                    </span>
                  </div>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void startOAuthLogin()}
                      disabled={oauthInProgress || isSubmitting}
                    >
                      {oauthInProgress ? (
                        <Spinner data-icon="inline-start" />
                      ) : (
                        <LogInIcon data-icon="inline-start" />
                      )}
                      {oauthInProgress
                        ? "Waiting for Google sign-in…"
                        : "Sign in with Google"}
                    </Button>
                    <FieldDescription>
                      Opens a Google consent page and stores a long-lived
                      refresh token. Access tokens are renewed automatically
                      before they expire.
                    </FieldDescription>
                  </>
                )}
                {oauthError ? (
                  <Alert variant="destructive">
                    <AlertCircleIcon />
                    <AlertTitle>Google sign-in failed</AlertTitle>
                    <AlertDescription>{oauthError}</AlertDescription>
                  </Alert>
                ) : null}
              </Field>
            ) : null}

            <Field>
              <FieldLabel htmlFor="account-api-key">
                {isAntigravity ? "Access token (optional)" : "API key"}
              </FieldLabel>
              <Input
                id="account-api-key"
                type="password"
                autoComplete="new-password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                disabled={isSubmitting}
                required={!isEditing && !isAntigravity}
                placeholder={
                  isEditing
                    ? "Leave blank to keep the current key"
                    : isAntigravity
                      ? "Filled automatically by the Google login"
                      : "Enter API key"
                }
              />
              <FieldDescription>
                {isEditing
                  ? "The saved key is not displayed. Fill this in only to replace it."
                  : isAntigravity
                    ? "Only paste a token here if you want to skip the Google sign-in flow."
                    : "The API key is stored securely and will not be shown again."}
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="account-quota-limit">
                Token quota limit
              </FieldLabel>
              <Input
                id="account-quota-limit"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={quotaLimit}
                onChange={(event) => setQuotaLimit(event.target.value)}
                disabled={isSubmitting}
                placeholder="Unlimited"
              />
              <FieldDescription>
                Leave blank for no token quota limit.
              </FieldDescription>
            </Field>
            {error ? (
              <Alert variant="destructive">
                <AlertCircleIcon />
                <AlertTitle>Account could not be saved</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <Spinner data-icon="inline-start" />
                ) : isEditing ? (
                  <SaveIcon data-icon="inline-start" />
                ) : (
                  <KeyRoundIcon data-icon="inline-start" />
                )}
                {isEditing ? "Save changes" : "Add account"}
              </Button>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}
