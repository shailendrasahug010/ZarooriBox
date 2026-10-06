import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, Sparkles } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { validateEmail, validateName, validatePassword } from '../../auth/validation';
import { Field } from '../../components/ui';
import { AuthShell, GoogleIcon } from './AuthShell';

function PasswordInput({ id, value, onChange, error, autoComplete }: { id: string; value: string; onChange: (v: string) => void; error?: string; autoComplete: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        className="input pr-12"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        maxLength={128}
      />
      <button
        type="button"
        className="absolute right-1 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-lg text-muted hover:text-ink"
        aria-label={show ? 'Hide password' : 'Show password'}
        onClick={() => setShow((s) => !s)}
      >
        {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
      </button>
    </div>
  );
}

function FormError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="mb-4 rounded-xl bg-attn-bg px-3.5 py-3 text-sm font-medium text-attn">
      {message}
    </p>
  );
}

function useAfterLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  return () => navigate(from && from.startsWith('/app') ? from : '/app', { replace: true });
}

function Alternatives() {
  const { signInDemo, signInWithGoogle, service } = useAuth();
  const done = useAfterLogin();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <>
      <div className="my-6 flex items-center gap-3 text-xs font-semibold uppercase tracking-wider text-muted" aria-hidden="true">
        <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
      </div>
      <FormError message={error} />
      <div className="space-y-2.5">
        <button
          type="button"
          className="btn btn-secondary w-full"
          disabled={!service.supportsGoogle}
          aria-describedby={!service.supportsGoogle ? 'google-note' : undefined}
          onClick={() => signInWithGoogle().catch((e: Error) => setError(e.message))}
        >
          <GoogleIcon /> Continue with Google
        </button>
        {!service.supportsGoogle && (
          <p id="google-note" className="text-center text-xs text-muted">
            Google sign-in turns on when LifeBox is connected to its cloud backend.
          </p>
        )}
        <button
          type="button"
          className="btn w-full bg-brand-50 text-brand-800 hover:bg-brand-100"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await signInDemo();
              done();
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Could not open the demo.');
              setBusy(false);
            }
          }}
        >
          <Sparkles className="size-4" aria-hidden="true" /> {busy ? 'Opening demo…' : 'Try the demo with sample data'}
        </button>
      </div>
    </>
  );
}

export function Login() {
  const { signIn } = useAuth();
  const done = useAfterLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next = { email: validateEmail(email) ?? undefined, password: password ? undefined : 'Enter your password.' };
    setErrors(next);
    if (next.email || next.password) return;
    setBusy(true);
    try {
      await signIn(email, password);
      done();
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : 'Could not log in.' });
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to see what needs your attention."
      footer={
        <>
          New to LifeBox?{' '}
          <Link to="/signup" className="font-semibold text-brand-700 hover:underline">
            Create a free account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        <FormError message={errors.form ?? ''} />
        <Field label="Email" htmlFor="login-email" error={errors.email}>
          <input
            id="login-email"
            type="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'login-email-error' : undefined}
          />
        </Field>
        <Field label="Password" htmlFor="login-password" error={errors.password}>
          <PasswordInput id="login-password" value={password} onChange={setPassword} error={errors.password} autoComplete="current-password" />
        </Field>
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-sm font-semibold text-brand-700 hover:underline">
            Forgot password?
          </Link>
        </div>
        <button type="submit" className="btn btn-primary w-full" disabled={busy}>
          {busy ? 'Logging in…' : 'Log in'}
        </button>
      </form>
      <Alternatives />
    </AuthShell>
  );
}

export function Signup() {
  const { signUp } = useAuth();
  const done = useAfterLogin();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next = {
      name: validateName(name) ?? undefined,
      email: validateEmail(email) ?? undefined,
      password: validatePassword(password) ?? undefined,
    };
    setErrors(next);
    if (next.name || next.email || next.password) return;
    setBusy(true);
    try {
      await signUp(name, email, password);
      done();
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : 'Could not sign up.' });
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Start remembering less"
      subtitle="Free forever for the basics. No credit card."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-brand-700 hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        <FormError message={errors.form ?? ''} />
        <Field label="Your name" htmlFor="su-name" error={errors.name}>
          <input id="su-name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" maxLength={60} aria-invalid={!!errors.name} />
        </Field>
        <Field label="Email" htmlFor="su-email" error={errors.email}>
          <input id="su-email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" aria-invalid={!!errors.email} />
        </Field>
        <Field label="Password" htmlFor="su-password" error={errors.password} hint="At least 8 characters, with letters and numbers.">
          <PasswordInput id="su-password" value={password} onChange={setPassword} error={errors.password} autoComplete="new-password" />
        </Field>
        <button type="submit" className="btn btn-primary w-full" disabled={busy}>
          {busy ? 'Creating your LifeBox…' : 'Create account'}
        </button>
        <p className="text-center text-xs text-muted">Your data is private to you. We never sell it or show ads.</p>
      </form>
      <Alternatives />
    </AuthShell>
  );
}

export function ForgotPassword() {
  const { service } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const v = validateEmail(email);
    if (v) return setError(v);
    setBusy(true);
    try {
      const r = await service.requestPasswordReset(email);
      setDevLink(r.devResetLink);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Reset your password"
      subtitle="We’ll send you a link to choose a new one."
      footer={
        <Link to="/login" className="font-semibold text-brand-700 hover:underline">
          Back to log in
        </Link>
      }
    >
      {sent ? (
        <div className="rounded-2xl bg-ok-bg p-4 text-ok" role="status">
          <p className="font-semibold">Check your inbox</p>
          <p className="mt-1 text-sm">If an account exists for {email}, a reset link is on its way.</p>
          {devLink && (
            <p className="mt-3 rounded-xl bg-white/70 p-3 text-sm text-ink-soft">
              This copy of LifeBox runs without an email server, so here’s your link:{' '}
              <Link to={devLink} className="font-semibold text-brand-700 underline">
                Choose a new password
              </Link>
            </p>
          )}
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-4">
          <Field label="Email" htmlFor="fp-email" error={error}>
            <input id="fp-email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" aria-invalid={!!error} />
          </Field>
          <button type="submit" className="btn btn-primary w-full" disabled={busy}>
            {busy ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}
    </AuthShell>
  );
}

export function ResetPassword() {
  const { service } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirm?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next = { password: validatePassword(password) ?? undefined, confirm: confirm === password ? undefined : 'Passwords don’t match.' };
    setErrors(next);
    if (next.password || next.confirm) return;
    setBusy(true);
    try {
      await service.resetPassword(params.get('token'), password);
      navigate('/login', { replace: true, state: { reset: true } });
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : 'Could not reset.' });
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Choose a new password">
      <form onSubmit={submit} noValidate className="space-y-4">
        <FormError message={errors.form ?? ''} />
        <Field label="New password" htmlFor="rp-password" error={errors.password} hint="At least 8 characters, with letters and numbers.">
          <PasswordInput id="rp-password" value={password} onChange={setPassword} error={errors.password} autoComplete="new-password" />
        </Field>
        <Field label="Confirm password" htmlFor="rp-confirm" error={errors.confirm}>
          <PasswordInput id="rp-confirm" value={confirm} onChange={setConfirm} error={errors.confirm} autoComplete="new-password" />
        </Field>
        <button type="submit" className="btn btn-primary w-full" disabled={busy}>
          {busy ? 'Saving…' : 'Save new password'}
        </button>
      </form>
    </AuthShell>
  );
}
