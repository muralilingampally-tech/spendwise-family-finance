import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApp } from "@/lib/store";
import { isFirebaseConfigured } from "@/lib/firebase";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — SpendWise" },
      { name: "description", content: "Sign in to SpendWise to manage your family finances." },
      { property: "og:title", content: "Sign in — SpendWise" },
      { property: "og:description", content: "Secure sign in for your SpendWise account." },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup" | "reset";
type FormValues = { name: string; email: string; password: string };

function AuthPage() {
  const navigate = useNavigate();
  const { ready, user, init, signInWithGoogle, signInWithEmail, signUpWithEmail, resetPassword } =
    useApp();
  const [mode, setMode] = useState<Mode>("signin");
  const [busy, setBusy] = useState(false);
  const { register, handleSubmit, formState } = useForm<FormValues>({
    defaultValues: { name: "", email: "", password: "" },
  });

  useEffect(() => init(), [init]);
  useEffect(() => {
    if (ready && user) navigate({ to: "/", replace: true });
  }, [ready, user, navigate]);

  const onSubmit = handleSubmit(async (values) => {
    setBusy(true);
    try {
      if (mode === "signin") await signInWithEmail(values.email, values.password);
      else if (mode === "signup") await signUpWithEmail(values.name, values.email, values.password);
      else {
        await resetPassword(values.email);
        toast.success("Password reset email sent");
        setMode("signin");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  });

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-sidebar p-12 text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-2">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
            <Wallet className="h-5 w-5" />
          </span>
          <span className="text-xl font-bold">SpendWise</span>
        </div>
        <div className="max-w-md">
          <h2 className="text-4xl font-extrabold leading-tight tracking-tight">
            Every rupee, accounted for.
          </h2>
          <p className="mt-4 text-sidebar-foreground/70">
            Track family income and expenses across cash, bank accounts, cards and UPI — with
            category masters you control.
          </p>
        </div>
        <p className="text-xs text-sidebar-foreground/50">Personal finance for families</p>
      </div>

      <div className="flex items-center justify-center px-5 py-16">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-bold tracking-tight">
            {mode === "signin" ? "Welcome back" : mode === "signup" ? "Create account" : "Reset password"}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {mode === "reset"
              ? "We'll email you a reset link."
              : "Sign in to continue to your dashboard."}
          </p>

          {mode !== "reset" && (
            <>
              <Button
                type="button"
                variant="outline"
                className="mt-6 w-full"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await signInWithGoogle();
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Google sign-in failed");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Continue with Google
              </Button>
              <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
              </div>
            </>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            {mode === "signup" && (
              <div className="space-y-1.5">
                <Label htmlFor="name">Full name</Label>
                <Input id="name" {...register("name", { required: true })} placeholder="Murali" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                {...register("email", { required: true })}
              />
            </div>
            {mode !== "reset" && (
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  {...register("password", { required: true, minLength: 6 })}
                />
                {formState.errors.password && (
                  <p className="text-xs text-destructive">Minimum 6 characters.</p>
                )}
              </div>
            )}
            <Button type="submit" className="w-full" disabled={busy}>
              {mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
            </Button>
          </form>

          <div className="mt-5 flex justify-between text-sm">
            <button
              className="text-primary hover:underline"
              onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
            >
              {mode === "signup" ? "Have an account? Sign in" : "Create an account"}
            </button>
            {mode !== "reset" && (
              <button className="text-muted-foreground hover:underline" onClick={() => setMode("reset")}>
                Forgot password?
              </button>
            )}
          </div>

          {!isFirebaseConfigured && (
            <p className="mt-8 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
              Demo mode: Firebase env vars aren't set, so any credentials sign you into a local
              browser-only workspace.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}