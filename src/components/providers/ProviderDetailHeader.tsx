import { ArrowLeftIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/hooks/useRouter";
import { transportMeta } from "@/lib/provider-meta";
import { cn } from "@/lib/utils";
import type { Provider } from "@/types/provider";

interface ProviderDetailHeaderProps {
  provider: Provider;
}

export function ProviderDetailHeader({ provider }: ProviderDetailHeaderProps) {
  const { navigate } = useRouter();
  const meta = transportMeta[provider.transport];

  return (
    <div className="flex flex-col gap-4">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-fit"
        onClick={() => navigate("/providers")}
      >
        <ArrowLeftIcon data-icon="inline-start" />
        Back to Providers
      </Button>

      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-lg border",
            meta.accentClassName,
          )}
        >
          {meta.icon ? (
            <img src={meta.icon} alt="" className="size-5" />
          ) : (
            <meta.fallbackIcon className="size-5" />
          )}
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {provider.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {provider.accountCount} connection
            {provider.accountCount !== 1 ? "s" : ""} · Prefix:{" "}
            <code className="font-mono">{provider.prefix}</code>
          </p>
        </div>
      </div>
    </div>
  );
}
