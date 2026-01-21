import { useEffect, useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Save, Download, Upload, ImagePlus, X } from "lucide-react";
import { useStore } from "@/store/useStore";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/ui/page-header";
import { toast } from "@/hooks/use-toast";
import defaultLogo from "@/assets/logo.png";

const settingsSchema = z.object({
  companyName: z.string().max(100),
  companyAddress: z.string().max(200),
  companyPhone: z.string().max(20),
  companyEmail: z.string().email().or(z.literal("")),
  defaultLaborRate: z.coerce.number().min(0),
  defaultTaxRate: z.coerce.number().min(0).max(100),
  invoicePrefix: z.string().max(10),
});

type SettingsFormData = z.infer<typeof settingsSchema>;

export default function Settings() {
  const { settings, updateSettings, exportData, importData } = useStore();
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { register, handleSubmit, reset } = useForm<SettingsFormData>({
    resolver: zodResolver(settingsSchema),
  });

  useEffect(() => {
    if (settings) {
      reset({
        companyName: settings.companyName,
        companyAddress: settings.companyAddress,
        companyPhone: settings.companyPhone,
        companyEmail: settings.companyEmail,
        defaultLaborRate: settings.defaultLaborRateCents / 100,
        defaultTaxRate: settings.defaultTaxRate,
        invoicePrefix: settings.invoicePrefix,
      });
      setLogoPreview(settings.companyLogo || null);
    }
  }, [settings, reset]);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 500 * 1024) {
        toast({
          title: "File too large",
          description: "Logo must be under 500KB",
          variant: "destructive",
        });
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveLogo = () => {
    setLogoPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const onSubmit = async (data: SettingsFormData) => {
    await updateSettings({
      companyName: data.companyName,
      companyAddress: data.companyAddress,
      companyPhone: data.companyPhone,
      companyEmail: data.companyEmail,
      defaultLaborRateCents: Math.round(data.defaultLaborRate * 100),
      defaultTaxRate: data.defaultTaxRate,
      invoicePrefix: data.invoicePrefix,
      companyLogo: logoPreview || undefined,
    });
    toast({
      title: "Settings saved",
      description: "Your settings have been updated successfully.",
    });
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const data = await exportData();
      const filename = `servicepro-backup-${new Date().toISOString().split("T")[0]}.json`;

      // Check if running in Tauri
      if (window.__TAURI__) {
        const { save } = await import("@tauri-apps/api/dialog");
        const { writeTextFile } = await import("@tauri-apps/api/fs");
        
        const filePath = await save({
          filters: [{ name: "JSON", extensions: ["json"] }],
          defaultPath: filename,
        });
        
        if (filePath) {
          await writeTextFile(filePath, data);
          toast({
            title: "Backup exported",
            description: `Backup saved to ${filePath}`,
          });
        }
      } else {
        // Web fallback - downloads to default browser downloads folder
        const blob = new Blob([data], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        toast({
          title: "Backup exported",
          description: `Downloaded as "${filename}" to your Downloads folder.`,
        });
      }
    } catch (error) {
      console.error("Export error:", error);
      toast({
        title: "Export failed",
        description: error instanceof Error ? error.message : "Failed to export data",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async () => {
    setIsImporting(true);
    try {
      let jsonData: string | null = null;

      // Check if running in Tauri
      if (window.__TAURI__) {
        const { open } = await import("@tauri-apps/api/dialog");
        const { readTextFile } = await import("@tauri-apps/api/fs");
        
        const filePath = await open({
          filters: [{ name: "JSON", extensions: ["json"] }],
          multiple: false,
        });
        
        if (filePath && typeof filePath === "string") {
          jsonData = await readTextFile(filePath);
        }
      } else {
        // Web fallback
        jsonData = await new Promise((resolve) => {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = ".json";
          input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) {
              const text = await file.text();
              resolve(text);
            } else {
              resolve(null);
            }
          };
          input.click();
        });
      }

      if (jsonData) {
        // Validate JSON structure
        const parsed = JSON.parse(jsonData);
        if (!parsed.customers || !parsed.jobs || !parsed.invoices) {
          throw new Error("Invalid backup file format");
        }

        if (confirm("This will replace all existing data. Continue?")) {
          await importData(jsonData);
          toast({
            title: "Backup restored",
            description: "Your data has been imported successfully.",
          });
        }
      }
    } catch (error) {
      console.error("Import error:", error);
      toast({
        title: "Import failed",
        description: error instanceof Error ? error.message : "Failed to import data",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <AppLayout>
      <PageHeader title="Settings" description="Configure your business settings" />

      <div className="max-w-2xl space-y-6">
        <form onSubmit={handleSubmit(onSubmit)} className="bg-card border border-border rounded-lg p-6 space-y-4">
          <h3 className="font-semibold">Company Branding</h3>
          <div className="flex items-start gap-6">
            <div className="flex flex-col items-center gap-2">
              <div className="w-20 h-20 rounded-lg border-2 border-dashed border-border flex items-center justify-center bg-muted/50 overflow-hidden">
                <img 
                  src={logoPreview || defaultLogo} 
                  alt="Company logo" 
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  <ImagePlus className="w-3 h-3" /> Change
                </button>
                {logoPreview && (
                  <button
                    type="button"
                    onClick={handleRemoveLogo}
                    className="text-xs text-destructive hover:underline flex items-center gap-1"
                  >
                    <X className="w-3 h-3" /> Remove
                  </button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleLogoChange}
                className="hidden"
              />
            </div>
            <div className="flex-1 space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Company Name</label>
                <input {...register("companyName")} className="input-field w-full" placeholder="Your Company Name" />
              </div>
              <p className="text-xs text-muted-foreground">
                This name and logo will appear in the sidebar and on invoices.
              </p>
            </div>
          </div>

          <h3 className="font-semibold pt-4">Contact Information</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Phone</label>
              <input {...register("companyPhone")} className="input-field w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input {...register("companyEmail")} type="email" className="input-field w-full" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Address</label>
            <input {...register("companyAddress")} className="input-field w-full" />
          </div>

          <h3 className="font-semibold pt-4">Defaults</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Labor Rate ($/hr)</label>
              <input {...register("defaultLaborRate")} type="number" step="0.01" className="input-field w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Tax Rate (%)</label>
              <input {...register("defaultTaxRate")} type="number" step="0.01" className="input-field w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Invoice Prefix</label>
              <input {...register("invoicePrefix")} className="input-field w-full" />
            </div>
          </div>

          <button type="submit" className="btn-primary flex items-center gap-2">
            <Save className="w-4 h-4" /> Save Settings
          </button>
        </form>

        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="font-semibold mb-2">Data Backup & Recovery</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Export your data as a backup file or import from a previous backup.
          </p>
          <div className="flex gap-3">
            <button 
              onClick={handleExport} 
              disabled={isExporting}
              className="btn-secondary flex items-center gap-2"
            >
              <Download className="w-4 h-4" /> 
              {isExporting ? "Exporting..." : "Export Backup"}
            </button>
            <button 
              onClick={handleImport} 
              disabled={isImporting}
              className="btn-secondary flex items-center gap-2"
            >
              <Upload className="w-4 h-4" /> 
              {isImporting ? "Importing..." : "Import Backup"}
            </button>
          </div>
        </div>

      </div>
    </AppLayout>
  );
}
