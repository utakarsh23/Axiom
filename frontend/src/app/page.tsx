"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Network, Github, Loader2, CheckCircle } from "lucide-react";

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);

  const handleGithubLogin = () => {
    setIsLoading(true);
    // Redirect to auth-service GitHub OAuth via NGINX
    window.location.href = "/auth/github";
  };

  const features = [
    "Graph-first architecture intelligence",
    "Blast-radius impact simulation",
    "Automated PR review & analysis",
    "Real-time system health monitoring",
  ];

  return (
    <div className="min-h-screen w-full flex bg-white">
      {/* ── Left Panel – Mint brand panel ──────────── */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-16 bg-[#C4F3C4]">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#231F20] flex items-center justify-center">
            <Network className="w-5 h-5 text-[#C4F3C4]" />
          </div>
          <span className="text-xl font-bold tracking-tight text-[#231F20]">
            Axiom<span className="opacity-60">.ai</span>
          </span>
        </div>

        {/* Hero Copy */}
        <div className="flex flex-col gap-10">
          <div className="flex flex-col gap-6">
            <span className="inline-flex w-fit bg-[#231F20] text-[#C4F3C4] text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full">
              Architecture Intelligence
            </span>
            <h1 className="text-5xl font-black leading-[1.1] tracking-tight text-[#231F20]">
              Understand your<br />
              codebase.<br />
              Instantly.
            </h1>
            <p className="text-[#231F20]/70 text-lg leading-relaxed max-w-md">
              The graph-first platform that maps dependencies, simulates blast radius,
              and reviews PRs before they break production.
            </p>
          </div>

          <ul className="flex flex-col gap-3">
            {features.map((f) => (
              <li key={f} className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-[#231F20] shrink-0" />
                <span className="text-[#231F20] text-sm font-medium">{f}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Footer note */}
        <p className="text-[#231F20]/60 text-xs">
          Trusted by engineering teams worldwide.
        </p>
      </div>

      {/* ── Right Panel – Login Form ───────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 lg:p-16 bg-white">
        {/* Mobile logo */}
        <div className="flex lg:hidden items-center gap-3 mb-12">
          <div className="w-10 h-10 rounded-xl bg-[#231F20] flex items-center justify-center">
            <Network className="w-5 h-5 text-[#C4F3C4]" />
          </div>
          <span className="text-xl font-bold tracking-tight text-[#231F20]">
            Axiom<span className="opacity-50">.ai</span>
          </span>
        </div>

        <div className="w-full max-w-md flex flex-col gap-8">
          {/* Heading */}
          <div className="flex flex-col gap-2">
            <h2 className="text-3xl font-black tracking-tight text-[#231F20]">Sign in</h2>
            <p className="text-[#6B6868] text-sm">
              Connect your GitHub account to get started.
            </p>
          </div>

          {/* GitHub Login */}
          <Button
            className="w-full h-12 bg-[#231F20] hover:bg-[#3D3839] text-white font-bold text-sm tracking-wide transition-colors"
            onClick={handleGithubLogin}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <Github className="mr-2 h-5 w-5" />
            )}
            Continue with GitHub
          </Button>

          <p className="text-center text-sm text-[#6B6868]">
            By signing in, you agree to our terms of service and privacy policy.
          </p>
        </div>
      </div>
    </div>
  );
}
