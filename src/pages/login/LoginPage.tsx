import { LoginForm } from "@/components/login/LoginForm";

interface LoginPageProps {
  onLogin: (password: string) => Promise<void>;
  onPasskeyLogin: () => Promise<void>;
}

export function LoginPage({ onLogin, onPasskeyLogin }: LoginPageProps) {
  return <LoginForm onLogin={onLogin} onPasskeyLogin={onPasskeyLogin} />;
}
