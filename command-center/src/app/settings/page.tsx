"use client";

import { Settings } from "lucide-react";
import { ScheduleEditor } from "@/components/settings/schedule-editor";
import { AutoApprove } from "@/components/settings/auto-approve";
import { EnvViewer } from "@/components/settings/env-viewer";
import { useSettings } from "@/hooks/use-settings";

export default function SettingsPage() {
  const { settings, isLoading, updateSettings } = useSettings();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <Settings className="w-5 h-5" />
          Settings
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Agent configuration and preferences.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ScheduleEditor settings={settings} isLoading={isLoading} />
        <AutoApprove settings={settings} isLoading={isLoading} onSave={updateSettings} />
      </div>

      <EnvViewer settings={settings} isLoading={isLoading} />
    </div>
  );
}
