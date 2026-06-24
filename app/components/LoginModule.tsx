"use client";

import { useEffect, useState, type FormEvent } from "react";

type LoginSuccessPayload = {
  access_token: string;
  role: string;
  user_name: string;
  branch_name: string;
};

type LoginModuleProps = {
  branchOptions: string[];
  accountBranches: Array<{ username: string; branch_name: string; role: string }>;
  onLogin: (payload: { username: string; password: string; branch?: string; role?: string }) => Promise<LoginSuccessPayload>;
};

export function LoginModule({ branchOptions, accountBranches, onLogin }: LoginModuleProps) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginRole, setLoginRole] = useState("admin");
  const [branch, setBranch] = useState("All branches");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const normalizedUser = username.trim().toLowerCase();
    if (normalizedUser === "admin") {
      setLoginRole("admin");
      setBranch("All branches");
      return;
    }
    const matched = accountBranches.find((account) => account.username.trim().toLowerCase() === normalizedUser);
    if (matched?.role) {
      setLoginRole(matched.role);
    }
    if (matched?.branch_name) {
      setBranch(matched.branch_name);
    }
  }, [accountBranches, username]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await onLogin({ username, password, branch, role: loginRole });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-screen">
      <section className="login-card">
        <div className="login-logo-wrap">
          <img className="login-logo" src="/login-logo.png" alt="Goldprince logo" />
        </div>
        <h1>GOLDPRINCE</h1>
        <form className="login-form" onSubmit={submit}>
          <label className="login-field">
            <span>Username</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              autoComplete="username"
            />
          </label>

          <label className="login-field">
            <span>Password</span>
            <div className="password-field">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                autoComplete="current-password"
              />
              <button
                className="password-toggle"
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                title={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 3l18 18" />
                    <path d="M10.58 10.58A2 2 0 0 0 12 16a2 2 0 0 0 1.42-.58" />
                    <path d="M9.88 5.05A10.45 10.45 0 0 1 12 5c7 0 10 7 10 7a18.35 18.35 0 0 1-3.17 4.4" />
                    <path d="M6.61 6.61A18.23 18.23 0 0 0 2 12s3 7 10 7a10.47 10.47 0 0 0 3.44-.59" />
                  </svg>
                ) : (
                  <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </label>

          <label className="login-field">
            <span>Role</span>
            <input value={loginRole.charAt(0).toUpperCase() + loginRole.slice(1)} readOnly />
          </label>

          {loginRole === "staff" ? (
            <label className="login-field">
              <span>Branch</span>
              <select value={branch} onChange={(e) => setBranch(e.target.value)}>
                <option value="All branches">All branches</option>
                {branchOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {error ? <div className="login-error" role="alert">{error}</div> : null}

          <button className="primary-btn login-submit" type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Login"}
          </button>
        </form>
      </section>
    </main>
  );
}
