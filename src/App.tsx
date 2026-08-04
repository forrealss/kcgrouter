import "./index.css";
import { AlertCircleIcon } from "lucide-react";
import { LoginForm } from "@/components/auth/LoginForm";
import { AppShell } from "@/components/layout/AppShell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useSession } from "@/hooks/useSession";

export function App() {
  const session = useSession();

  if (session.status === "loading") {
    return (
      <div className="flex min-h-svh items-center justify-center p-6">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (session.status === "error") {
    return (
      <div className="flex min-h-svh items-center justify-center p-6">
        <Alert className="max-w-md" variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>Dashboard tidak dapat dimuat</AlertTitle>
          <AlertDescription className="gap-3">
            <p>{session.error}</p>
            <Button variant="outline" onClick={() => void session.refresh()}>
              Coba lagi
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (session.status === "unauthenticated") {
    return (
      <div className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
        <LoginForm onLogin={session.login} />
      </div>
    );
  }

  return <AppShell onLogout={session.logout} />;
}

export default App;
