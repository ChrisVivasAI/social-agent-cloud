"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { FileVideo, Search, X, Eye } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { FootageAsset } from "@/lib/supabase/types";
import { StatusBadge } from "@/components/shared/status-badge";
import { CardSkeleton } from "@/components/shared/loading-skeleton";
import { EmptyState } from "@/components/shared/empty-state";

function formatBytes(bytes: number | undefined): string {
  if (!bytes) return "--";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(ms: number | undefined): string {
  if (!ms) return "--";
  const sec = Math.round(ms / 1000);
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return min > 0 ? `${min}:${String(rem).padStart(2, "0")}` : `${rem}s`;
}

export function FootageBrowser() {
  const [assets, setAssets] = useState<FootageAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTag, setSearchTag] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [analysisFilter, setAnalysisFilter] = useState<string>("all");
  const [previewId, setPreviewId] = useState<string | null>(null);

  const fetchAssets = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    let query = supabase
      .from("footage_assets")
      .select("*")
      .order("created_at", { ascending: false });

    if (sourceFilter !== "all") {
      query = query.eq("source", sourceFilter);
    }
    if (analysisFilter !== "all") {
      query = query.eq("analysis_status", analysisFilter);
    }

    const { data } = await query;
    if (data) setAssets(data as FootageAsset[]);
    setLoading(false);
  }, [sourceFilter, analysisFilter]);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  const filtered = useMemo(() => {
    if (!searchTag.trim()) return assets;
    const term = searchTag.toLowerCase();
    return assets.filter((a) =>
      a.tags?.some((t) => t.toLowerCase().includes(term))
    );
  }, [assets, searchTag]);

  const previewAsset = previewId ? assets.find((a) => a.id === previewId) : null;

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search tags..."
            value={searchTag}
            onChange={(e) => setSearchTag(e.target.value)}
            className="bg-card border border-border rounded-md pl-8 pr-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground w-48"
          />
          {searchTag && (
            <button
              onClick={() => setSearchTag("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="bg-card border border-border rounded-md px-3 py-1.5 text-sm text-foreground"
        >
          <option value="all">All Sources</option>
          <option value="slack_upload">Slack Upload</option>
          <option value="url_ingest">URL Ingest</option>
          <option value="generated">Generated</option>
        </select>

        <select
          value={analysisFilter}
          onChange={(e) => setAnalysisFilter(e.target.value)}
          className="bg-card border border-border rounded-md px-3 py-1.5 text-sm text-foreground"
        >
          <option value="all">All Analysis</option>
          <option value="pending">Pending</option>
          <option value="scanning">Scanning</option>
          <option value="analyzed">Analyzed</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<FileVideo className="w-12 h-12" />}
          title="No footage assets"
          description={searchTag ? "No assets match your search." : "Footage assets will appear here once ingested."}
        />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map((asset) => (
            <div
              key={asset.id}
              className="rounded-lg border border-border bg-card overflow-hidden group"
            >
              <div className="aspect-video bg-muted flex items-center justify-center relative">
                <FileVideo className="w-6 h-6 text-muted-foreground" />
                <button
                  onClick={() => setPreviewId(asset.id)}
                  className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100"
                >
                  <Eye className="w-5 h-5 text-white" />
                </button>
              </div>
              <div className="p-2.5 space-y-1.5">
                <p className="text-xs font-medium text-foreground truncate">
                  {asset.original_filename || asset.storage_path.split("/").pop()}
                </p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{formatDuration(asset.duration_ms)}</span>
                  <span>{formatBytes(asset.file_size_bytes)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <StatusBadge status={asset.analysis_status} />
                  {asset.tags && asset.tags.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {asset.tags.length} tag{asset.tags.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {previewAsset && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-8">
          <div className="bg-card border border-border rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-medium text-foreground text-sm">
                {previewAsset.original_filename || "Footage Preview"}
              </h3>
              <button
                onClick={() => setPreviewId(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-muted-foreground">Duration:</span>{" "}
                  <span className="text-foreground">{formatDuration(previewAsset.duration_ms)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Resolution:</span>{" "}
                  <span className="text-foreground">
                    {previewAsset.width && previewAsset.height
                      ? `${previewAsset.width}x${previewAsset.height}`
                      : "--"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">FPS:</span>{" "}
                  <span className="text-foreground">{previewAsset.fps ?? "--"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Size:</span>{" "}
                  <span className="text-foreground">{formatBytes(previewAsset.file_size_bytes)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Source:</span>{" "}
                  <span className="text-foreground capitalize">
                    {previewAsset.source.replace(/_/g, " ")}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Analysis:</span>{" "}
                  <StatusBadge status={previewAsset.analysis_status} />
                </div>
              </div>

              {previewAsset.tags && previewAsset.tags.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground mb-1.5">Tags</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {previewAsset.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {previewAsset.flash_analysis && (
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground mb-1.5">
                    Flash Analysis
                  </h4>
                  <pre className="text-xs text-foreground bg-muted/30 p-3 rounded overflow-x-auto max-h-40">
                    {JSON.stringify(previewAsset.flash_analysis, null, 2)}
                  </pre>
                </div>
              )}

              {previewAsset.scene_boundaries && previewAsset.scene_boundaries.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground mb-1.5">
                    Scene Boundaries
                  </h4>
                  <div className="space-y-1.5">
                    {previewAsset.scene_boundaries.map((scene, i) => (
                      <div key={i} className="text-xs p-2 rounded bg-muted/30">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <span>{formatDuration(scene.start_ms)} - {formatDuration(scene.end_ms)}</span>
                        </div>
                        <p className="text-foreground mt-0.5">{scene.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {previewAsset.key_moments && previewAsset.key_moments.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground mb-1.5">
                    Key Moments
                  </h4>
                  <div className="space-y-1.5">
                    {previewAsset.key_moments.map((moment, i) => (
                      <div key={i} className="text-xs p-2 rounded bg-muted/30 flex items-start gap-2">
                        <span className="text-muted-foreground shrink-0">
                          {formatDuration(moment.timestamp_ms)}
                        </span>
                        <span className="text-foreground">{moment.description}</span>
                        <span className="text-muted-foreground shrink-0 ml-auto">
                          imp: {moment.importance}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
