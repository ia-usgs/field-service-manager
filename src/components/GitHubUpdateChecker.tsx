import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Download, X, Github } from "lucide-react";

const GITHUB_RAW_URL = "https://raw.githubusercontent.com/ia-usgs/field-service-manager/main/public/version.json";
const GITHUB_RELEASES_URL = "https://github.com/ia-usgs/field-service-manager/releases";
const CHECK_INTERVAL = 60 * 1000; // Check every 60 seconds

interface VersionInfo {
  version: string;
  updatedAt: string;
}

export function GitHubUpdateChecker() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  const checkForUpdates = useCallback(async () => {
    if (isChecking) return;
    
    setIsChecking(true);
    
    try {
      // Fetch current bundled version (cache-busted to avoid SW/HTTP caches)
      const localResponse = await fetch(`/version.json?t=${Date.now()}`, {
        cache: "no-store",
      });
      const localData: VersionInfo = await localResponse.json();
      setCurrentVersion(localData.version);

      // Fetch latest version from GitHub (with cache-busting)
      const githubResponse = await fetch(`${GITHUB_RAW_URL}?t=${Date.now()}`, {
        cache: "no-store",
      });
      
      if (!githubResponse.ok) {
        console.log("GitHub version check failed:", githubResponse.status);
        return;
      }

      const githubData: VersionInfo = await githubResponse.json();
      setLatestVersion(githubData.version);

      // Compare versions
      if (localData.version !== githubData.version) {
        console.log(`Update available: ${localData.version} → ${githubData.version}`);
        setShowPrompt(true);
      }
    } catch (error) {
      console.log("Version check error:", error);
    } finally {
      setIsChecking(false);
    }
  }, [isChecking]);

  useEffect(() => {
    // Initial check after a short delay
    const initialTimeout = setTimeout(checkForUpdates, 5000);

    // Periodic checks
    const interval = setInterval(checkForUpdates, CHECK_INTERVAL);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [checkForUpdates]);

  const handleUpdate = () => {
    // For Tauri desktop apps, open the GitHub releases page to download the new exe
    window.open(GITHUB_RELEASES_URL, "_blank");
  };

  const handleDismiss = () => {
    setShowPrompt(false);
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-lg border bg-card p-4 shadow-lg animate-in slide-in-from-bottom-5">
      <Github className="h-5 w-5 text-primary" />
      <div className="flex flex-col">
        <span className="font-medium text-foreground">Update Available</span>
        <span className="text-sm text-muted-foreground">
          {currentVersion} → {latestVersion}
        </span>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={handleUpdate} className="gap-1">
          <Download className="h-3 w-3" />
          Download
        </Button>
        <Button size="sm" variant="ghost" onClick={handleDismiss}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
