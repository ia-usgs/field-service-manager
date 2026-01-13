import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Save, Download, Upload } from "lucide-react";
import { useStore } from "@/store/useStore";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/ui/page-header";

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
    }
  }, [settings, reset]);

  const onSubmit = async (data: SettingsFormData) => {
    await updateSettings({
      companyName: data.companyName,
      companyAddress: data.companyAddress,
      companyPhone: data.companyPhone,
      companyEmail: data.companyEmail,
      defaultLaborRateCents: Math.round(data.defaultLaborRate * 100),
      defaultTaxRate: data.defaultTaxRate,
      invoicePrefix: data.invoicePrefix,
    });
  };

  const handleExport = async () => {
    const data = await exportData();
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `servicepro-backup-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const text = await file.text();
        if (confirm("This will replace all existing data. Continue?")) {
          await importData(text);
          alert("Data imported successfully!");
        }
      }
    };
    input.click();
  };

  return (
    <AppLayout>
      <PageHeader title="Settings" description="Configure your business settings" />

      <div className="max-w-2xl space-y-6">
        <form onSubmit={handleSubmit(onSubmit)} className="bg-card border border-border rounded-lg p-6 space-y-4">
          <h3 className="font-semibold">Company Information</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Company Name</label>
              <input {...register("companyName")} className="input-field w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Phone</label>
              <input {...register("companyPhone")} className="input-field w-full" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Address</label>
            <input {...register("companyAddress")} className="input-field w-full" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input {...register("companyEmail")} type="email" className="input-field w-full" />
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
          <h3 className="font-semibold mb-4">Data Backup & Recovery</h3>
          <div className="flex gap-3">
            <button onClick={handleExport} className="btn-secondary flex items-center gap-2">
              <Download className="w-4 h-4" /> Export Backup
            </button>
            <button onClick={handleImport} className="btn-secondary flex items-center gap-2">
              <Upload className="w-4 h-4" /> Import Backup
            </button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
