"use client";

import { CardSkeleton } from "@/components/shared/loading-skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { Mic, Shield, CheckCircle } from "lucide-react";
import type { VoiceProfile as VoiceProfileType } from "@/lib/supabase/types";

interface VoiceProfileProps {
  profile: VoiceProfileType | null;
  isLoading: boolean;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-foreground">{title}</h4>
      {children}
    </div>
  );
}

function KVRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs text-foreground">{String(value)}</span>
    </div>
  );
}

function TagList({ items, variant = "default" }: { items: string[]; variant?: "default" | "green" | "red" }) {
  const colors = {
    default: "bg-muted text-foreground",
    green: "bg-green-500/20 text-green-400",
    red: "bg-red-500/20 text-red-400",
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, i) => (
        <span key={i} className={`px-2 py-0.5 rounded text-xs ${colors[variant]}`}>
          {item}
        </span>
      ))}
    </div>
  );
}

export function VoiceProfileView({ profile, isLoading }: VoiceProfileProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (!profile) {
    return (
      <EmptyState
        icon={<Mic className="w-12 h-12" />}
        title="No voice profile"
        description="The agent hasn't built a voice profile yet."
      />
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Mic className="w-4 h-4" />
          Voice Profile
        </h3>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>Confidence: {Math.round(profile.confidence * 100)}%</span>
          <span>{profile.episode_count} episodes</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Section title="General">
          <KVRow label="Tone" value={profile.general.tone} />
          <KVRow label="Formality" value={profile.general.formality_level} />
          <KVRow label="Humor" value={profile.general.humor_style} />
          <KVRow label="Sentence Length" value={profile.general.sentence_length_preference} />
          <KVRow label="Vocabulary" value={profile.general.vocabulary_level} />
        </Section>

        <Section title="Twitter Settings">
          <KVRow label="Max Length" value={profile.twitter.max_length} />
          <KVRow label="Opening Style" value={profile.twitter.opening_style} />
          <KVRow label="Emoji Usage" value={profile.twitter.emoji_usage} />
          <KVRow label="Hashtag Usage" value={profile.twitter.hashtag_usage} />
          <KVRow label="Thread Preference" value={profile.twitter.thread_preference} />
        </Section>

        <Section title="LinkedIn Settings">
          <KVRow label="Typical Length" value={profile.linkedin.typical_length} />
          <KVRow label="Structure" value={profile.linkedin.structure} />
          <KVRow label="Tone" value={profile.linkedin.professional_vs_casual} />
          <KVRow label="CTA Style" value={profile.linkedin.cta_style} />
        </Section>

        <Section title="Topic Framings">
          {Object.keys(profile.topics.preferred_framings).length > 0 ? (
            Object.entries(profile.topics.preferred_framings).map(([topic, framing]) => (
              <KVRow key={topic} label={topic} value={framing} />
            ))
          ) : (
            <p className="text-xs text-muted-foreground">No topic framings configured.</p>
          )}
        </Section>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Section title="Always Do">
          {profile.always_do.length > 0 ? (
            <div className="space-y-1">
              {profile.always_do.map((rule, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-foreground/90">
                  <CheckCircle className="w-3.5 h-3.5 text-green-400 mt-0.5 shrink-0" />
                  {rule}
                </div>
              ))}
            </div>
          ) : (
            <TagList items={["None configured"]} />
          )}
        </Section>

        <Section title="Never Do">
          {profile.never_do.length > 0 ? (
            <div className="space-y-1">
              {profile.never_do.map((rule, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-foreground/90">
                  <Shield className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                  {rule}
                </div>
              ))}
            </div>
          ) : (
            <TagList items={["None configured"]} />
          )}
        </Section>
      </div>
    </div>
  );
}
