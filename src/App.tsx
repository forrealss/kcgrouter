import "./index.css";
import { AlertCircleIcon } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { defaultPath } from "@/components/layout/Sidebar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useRouter } from "@/hooks/useRouter";
import { useSession } from "@/hooks/useSession";
import { LoginPage } from "@/pages/login/LoginPage";

export function App() {
  const session = useSession();
  const { pathname, navigate } = useRouter();

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
    if (pathname !== "/login") {
      navigate("/login");
      return null;
    }
    return (
      <LoginPage
        onLogin={async (password) => {
          await session.login(password);
          navigate(defaultPath);
        }}
      />
    );
  }

  if (pathname === "/login") {
    navigate(defaultPath);
    return null;
  }

  return <AppShell onLogout={session.logout} />;
}

export default App;
