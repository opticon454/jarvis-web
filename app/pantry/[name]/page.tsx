"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { Sidebar } from "@/components/layout/Sidebar";
import { componentName, getPackageDetail, PantryCommandDetail } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  Download,
  Loader2,
  Package,
  Shield,
  Star,
} from "lucide-react";

const DANGER_COLORS: Record<number, string> = {
  1: "bg-green-500/20 text-green-400",
  2: "bg-lime-500/20 text-lime-400",
  3: "bg-amber-500/20 text-amber-400",
  4: "bg-orange-500/20 text-orange-400",
  5: "bg-red-500/20 text-red-400",
};

export default function PantryDetailPage() {
  const { name } = useParams<{ name: string }>();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [pkg, setPkg] = useState<PantryCommandDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!name) return;
    let cancelled = false;
    getPackageDetail(name)
      .then((data) => { if (!cancelled) setPkg(data); })
      .catch(() => { if (!cancelled) setError("Could not load package"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [name]);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [user, authLoading, router]);

  if (authLoading || !user) return null;

  const dangerCls = pkg ? (DANGER_COLORS[pkg.danger_rating] ?? "bg-zinc-800 text-zinc-400") : "";

  return (
    <div className="flex h-full">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b border-zinc-800 px-4">
          <button onClick={() => router.push("/pantry")} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="text-lg font-semibold">Package Details</h1>
        </header>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
            </div>
          ) : error || !pkg ? (
            <div className="flex h-full flex-col items-center justify-center gap-2">
              <p className="text-zinc-400">{error ?? "Package not found"}</p>
              <button onClick={() => router.push("/pantry")} className="text-sm text-primary hover:underline">
                Back to Pantry
              </button>
            </div>
          ) : (
            <div className="mx-auto max-w-2xl space-y-6 p-4">
              {/* Header */}
              <div>
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Package className="h-6 w-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-semibold text-zinc-100">
                        {pkg.display_name || pkg.command_name}
                      </h2>
                      {pkg.verified && <CheckCircle className="h-4 w-4 text-primary" />}
                      {pkg.package_type === "bundle" && (
                        <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                          Bundle
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-zinc-500">
                      {typeof pkg.author === "string"
                        ? pkg.author
                        : pkg.author.display_name ?? pkg.author.github}
                    </p>
                  </div>
                </div>
              </div>

              {/* Stats row */}
              <div className="flex flex-wrap items-center gap-4 text-sm text-zinc-400">
                <span className="flex items-center gap-1.5">
                  <Download className="h-4 w-4" />
                  {pkg.install_count} installs
                </span>
                <span>v{pkg.latest_version}</span>
                {pkg.avg_rating != null && (
                  <span className="flex items-center gap-1">
                    <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                    {pkg.avg_rating.toFixed(1)}
                    <span className="text-zinc-500">({pkg.review_count})</span>
                  </span>
                )}
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", dangerCls)}>
                  <Shield className="mr-0.5 inline h-3 w-3" />
                  Risk {pkg.danger_rating}
                </span>
              </div>

              {/* Description */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
                <p className="text-sm leading-relaxed text-zinc-300">{pkg.description}</p>
              </div>

              {/* Categories */}
              {pkg.categories.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {pkg.categories.map((cat) => (
                    <span key={cat} className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-400">
                      {cat}
                    </span>
                  ))}
                </div>
              )}

              {/* Components (bundles) */}
              {pkg.components.length > 1 && (
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Components
                  </h3>
                  <div className="space-y-1.5">
                    {pkg.components.map((comp) => (
                      <div key={componentName(comp)} className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-300">
                        {componentName(comp)}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Security report */}
              {pkg.security_report && (
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Security Report
                  </h3>
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
                    <p className="text-sm text-zinc-300">{pkg.security_report.summary}</p>
                    {pkg.security_report.concerns.length > 0 && (
                      <ul className="mt-3 space-y-1.5">
                        {pkg.security_report.concerns.map((concern, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs text-zinc-400">
                            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
                            {concern}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </section>
              )}

              {/* Info */}
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Info
                </h3>
                <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
                  <div className="grid grid-cols-2 gap-y-2 text-sm">
                    {pkg.license && (
                      <>
                        <span className="text-zinc-500">License</span>
                        <span className="text-zinc-300">{pkg.license}</span>
                      </>
                    )}
                    {pkg.platforms.length > 0 && (
                      <>
                        <span className="text-zinc-500">Platforms</span>
                        <span className="text-zinc-300">{pkg.platforms.join(", ")}</span>
                      </>
                    )}
                    <span className="text-zinc-500">Type</span>
                    <span className="text-zinc-300 capitalize">{pkg.package_type}</span>
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
