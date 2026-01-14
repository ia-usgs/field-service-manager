import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Save, Download, Upload, Database } from "lucide-react";
import { useStore } from "@/store/useStore";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/ui/page-header";
import { toast } from "@/hooks/use-toast";

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
  const { 
    settings, updateSettings, exportData, importData, 
    addCustomer, addInventoryItem, addJob, addExpense, addReminder, completeJob, recordPayment,
    customers, inventoryItems, jobs, expenses 
  } = useStore();
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);

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
    toast({
      title: "Settings saved",
      description: "Your settings have been updated successfully.",
    });
  };

  const handleSeedTestData = async () => {
    setIsSeeding(true);
    try {
      let customersAdded = 0;
      let inventoryAdded = 0;
      let jobsAdded = 0;
      let expensesAdded = 0;

      // Add test customers if none exist
      let customerIds: string[] = [];
      if (customers.length === 0) {
        const c1 = await addCustomer({
          name: "John Smith",
          email: "john.smith@example.com",
          phone: "(555) 123-4567",
          address: "123 Main Street, Springfield, IL 62701",
          notes: "Preferred customer. Has annual maintenance contract.",
          tags: ["residential", "priority"],
        });
        const c2 = await addCustomer({
          name: "ABC Manufacturing",
          email: "maintenance@abcmfg.com",
          phone: "(555) 987-6543",
          address: "500 Industrial Blvd, Chicago, IL 60601",
          notes: "Commercial account. Net 30 terms.",
          tags: ["commercial", "net-30"],
        });
        const c3 = await addCustomer({
          name: "Sarah Johnson",
          email: "sarah.j@email.com",
          phone: "(555) 456-7890",
          address: "456 Oak Avenue, Naperville, IL 60540",
          notes: "New customer referral from John Smith.",
          tags: ["residential"],
        });
        customerIds = [c1.id, c2.id, c3.id];
        customersAdded = 3;
      } else {
        customerIds = customers.slice(0, 3).map(c => c.id);
      }

      // Add test inventory items if none exist
      let inventoryIds: string[] = [];
      if (inventoryItems.length === 0) {
        const i1 = await addInventoryItem({
          name: "20A Circuit Breaker",
          sku: "CB-20A-001",
          description: "Standard 20 amp single-pole circuit breaker",
          unitCostCents: 850,
          unitPriceCents: 1500,
          quantity: 25,
          reorderLevel: 10,
          category: "Breakers",
        });
        const i2 = await addInventoryItem({
          name: "GFCI Outlet",
          sku: "GFCI-15A-WH",
          description: "15 amp GFCI outlet, white, tamper-resistant",
          unitCostCents: 1200,
          unitPriceCents: 2500,
          quantity: 15,
          reorderLevel: 5,
          category: "Outlets",
        });
        const i3 = await addInventoryItem({
          name: "LED Panel Light 2x4",
          sku: "LED-2X4-40W",
          description: "40W LED flat panel light, 4000K, dimmable",
          unitCostCents: 4500,
          unitPriceCents: 8500,
          quantity: 10,
          reorderLevel: 3,
          category: "Lighting",
        });
        const i4 = await addInventoryItem({
          name: "Romex 12/2 Wire (250ft)",
          sku: "ROMEX-12-2-250",
          description: "12 gauge, 2 conductor with ground, NM-B cable",
          unitCostCents: 8500,
          unitPriceCents: 12500,
          quantity: 8,
          reorderLevel: 2,
          category: "Wire",
        });
        const i5 = await addInventoryItem({
          name: "Smart Thermostat",
          sku: "THERM-WIFI-PRO",
          description: "WiFi-enabled programmable thermostat",
          unitCostCents: 9500,
          unitPriceCents: 17500,
          quantity: 5,
          reorderLevel: 2,
          category: "HVAC",
        });
        inventoryIds = [i1.id, i2.id, i3.id, i4.id, i5.id];
        inventoryAdded = 5;
      } else {
        inventoryIds = inventoryItems.slice(0, 5).map(i => i.id);
      }

      // Add test jobs if none exist
      if (jobs.length === 0 && customerIds.length > 0) {
        const today = new Date();
        const daysAgo = (days: number) => {
          const d = new Date(today);
          d.setDate(d.getDate() - days);
          return d.toISOString().split("T")[0];
        };
        const daysFromNow = (days: number) => {
          const d = new Date(today);
          d.setDate(d.getDate() + days);
          return d.toISOString().split("T")[0];
        };

        // Job 1: Quoted (pending)
        await addJob({
          customerId: customerIds[0],
          dateOfService: daysFromNow(7),
          problemDescription: "Customer requests quote for whole-house surge protector installation",
          workPerformed: "",
          laborHours: 0,
          laborRateCents: 8500,
          parts: [],
          miscFeesCents: 0,
          miscFeesDescription: "",
          taxRate: 8.25,
          status: "quoted",
          technicianNotes: "Estimate: 2 hours labor + surge protector unit. Will need to check panel capacity.",
        });
        jobsAdded++;

        // Job 2: In Progress
        const job2 = await addJob({
          customerId: customerIds[1],
          dateOfService: daysAgo(1),
          problemDescription: "Replace outdated fluorescent lighting with LED panels in warehouse section B",
          workPerformed: "Removed 6 old fluorescent fixtures. Installing new LED panels - 4 of 6 complete.",
          laborHours: 4,
          laborRateCents: 9500,
          parts: inventoryIds.length > 2 ? [
            { id: "p1", name: "LED Panel Light 2x4", quantity: 4, unitCostCents: 4500, unitPriceCents: 8500, source: "inventory" as const, inventoryItemId: inventoryIds[2] },
          ] : [],
          miscFeesCents: 2500,
          miscFeesDescription: "Disposal fee for old fixtures",
          taxRate: 8.25,
          status: "in-progress",
          technicianNotes: "Need to return tomorrow to complete remaining 2 fixtures. Customer approved overtime if needed.",
        });
        jobsAdded++;

        // Add reminder for in-progress job
        await addReminder({
          jobId: job2.id,
          customerId: customerIds[1],
          type: "follow-up",
          title: "Complete LED installation at ABC Manufacturing",
          description: "Finish installing remaining 2 LED panels in warehouse section B",
          dueDate: daysFromNow(1),
        });

        // Job 3: Completed (will generate invoice)
        const job3 = await addJob({
          customerId: customerIds[0],
          dateOfService: daysAgo(5),
          problemDescription: "GFCI outlets not working in kitchen - tripping immediately when reset",
          workPerformed: "Diagnosed faulty GFCI outlet in kitchen. Replaced 2 GFCI outlets and tested all kitchen circuits. Found and repaired loose neutral connection in junction box.",
          laborHours: 2.5,
          laborRateCents: 8500,
          parts: inventoryIds.length > 1 ? [
            { id: "p1", name: "GFCI Outlet", quantity: 2, unitCostCents: 1200, unitPriceCents: 2500, source: "inventory" as const, inventoryItemId: inventoryIds[1] },
          ] : [],
          miscFeesCents: 0,
          miscFeesDescription: "",
          taxRate: 8.25,
          status: "quoted", // Will be completed below
          technicianNotes: "Recommended whole-house surge protector. Customer interested - scheduled quote visit.",
        });
        // Complete this job to generate invoice
        await completeJob(job3.id);
        jobsAdded++;

        // Add maintenance reminder
        await addReminder({
          jobId: job3.id,
          customerId: customerIds[0],
          type: "maintenance",
          title: "6-month GFCI check for John Smith",
          description: "Follow-up inspection of GFCI outlets installed in kitchen",
          dueDate: daysFromNow(180),
        });

        // Job 4: Invoiced (awaiting payment)
        const job4 = await addJob({
          customerId: customerIds[2],
          dateOfService: daysAgo(10),
          problemDescription: "Install new 20A circuit for home office equipment",
          workPerformed: "Installed dedicated 20A circuit from panel to home office. Ran 45ft of 12/2 Romex through attic. Installed new outlet and breaker. Tested and labeled circuit.",
          laborHours: 3,
          laborRateCents: 8500,
          parts: inventoryIds.length > 3 ? [
            { id: "p1", name: "20A Circuit Breaker", quantity: 1, unitCostCents: 850, unitPriceCents: 1500, source: "inventory" as const, inventoryItemId: inventoryIds[0] },
            { id: "p2", name: "Romex 12/2 Wire (250ft)", quantity: 1, unitCostCents: 8500, unitPriceCents: 12500, source: "inventory" as const, inventoryItemId: inventoryIds[3] },
          ] : [],
          miscFeesCents: 1500,
          miscFeesDescription: "Permit fee",
          taxRate: 8.25,
          status: "quoted",
          technicianNotes: "Clean installation. Customer very satisfied with cable management.",
        });
        await completeJob(job4.id);
        jobsAdded++;

        // Job 5: Paid (complete cycle)
        const job5 = await addJob({
          customerId: customerIds[1],
          dateOfService: daysAgo(30),
          problemDescription: "Emergency call - power outage in main production area",
          workPerformed: "Diagnosed tripped main breaker due to overloaded circuit. Replaced damaged 100A breaker. Redistributed load across multiple circuits. Installed current monitoring on critical circuits.",
          laborHours: 4,
          laborRateCents: 12500, // Emergency rate
          parts: [
            { id: "p1", name: "100A Main Breaker", quantity: 1, unitCostCents: 8500, unitPriceCents: 15000, source: "inventory" as const },
            { id: "p2", name: "Current Monitor", quantity: 2, unitCostCents: 4500, unitPriceCents: 7500, source: "inventory" as const },
          ],
          miscFeesCents: 7500,
          miscFeesDescription: "Emergency after-hours call-out fee",
          taxRate: 8.25,
          status: "quoted",
          technicianNotes: "Recommended electrical audit to prevent future overloads. Customer approved - scheduling next month.",
        });
        const invoice5 = await completeJob(job5.id);
        // Record full payment
        await recordPayment(invoice5.id, invoice5.totalCents, "check", "Check #4521");
        jobsAdded++;

        // Job 6: With customer-provided parts (pass-through)
        const job6 = await addJob({
          customerId: customerIds[0],
          dateOfService: daysAgo(15),
          problemDescription: "Install smart thermostat provided by customer",
          workPerformed: "Installed customer-supplied Nest thermostat. Ran new C-wire from furnace to thermostat location. Configured WiFi and tested heating/cooling modes.",
          laborHours: 1.5,
          laborRateCents: 8500,
          parts: [
            { id: "p1", name: "Nest Thermostat (customer provided)", quantity: 1, unitCostCents: 0, unitPriceCents: 0, source: "customer-provided" as const },
            { id: "p2", name: "Thermostat Wire 18/5 (25ft)", quantity: 1, unitCostCents: 1500, unitPriceCents: 2500, source: "inventory" as const },
          ],
          miscFeesCents: 0,
          miscFeesDescription: "",
          taxRate: 8.25,
          status: "quoted",
          technicianNotes: "Customer handled thermostat app setup. All working correctly.",
        });
        const invoice6 = await completeJob(job6.id);
        // Partial payment
        await recordPayment(invoice6.id, Math.round(invoice6.totalCents * 0.5), "credit-card", "Visa ending 4242 - partial payment");
        jobsAdded++;

        // Add annual reminder
        await addReminder({
          jobId: job6.id,
          customerId: customerIds[0],
          type: "annual-checkup",
          title: "Annual HVAC system check for John Smith",
          description: "Annual inspection of thermostat and HVAC electrical connections",
          dueDate: daysFromNow(365),
        });
      }

      // Add test expenses if none exist
      if (expenses.length === 0) {
        const today = new Date();
        const daysAgo = (days: number) => {
          const d = new Date(today);
          d.setDate(d.getDate() - days);
          return d.toISOString().split("T")[0];
        };

        await addExpense({
          date: daysAgo(2),
          vendor: "Home Depot",
          category: "parts",
          description: "Restock - wire nuts, electrical tape, junction boxes",
          amountCents: 8750,
          notes: "Monthly consumables restock",
        });
        await addExpense({
          date: daysAgo(7),
          vendor: "Shell Gas Station",
          category: "fuel",
          description: "Service van fuel",
          amountCents: 6500,
          notes: "",
        });
        await addExpense({
          date: daysAgo(14),
          vendor: "Milwaukee Tools",
          category: "tools",
          description: "M18 Impact Driver replacement",
          amountCents: 19900,
          notes: "Previous driver stopped working - warranty expired",
        });
        await addExpense({
          date: daysAgo(20),
          vendor: "Jiffy Lube",
          category: "vehicle",
          description: "Service van oil change and inspection",
          amountCents: 7500,
          notes: "50,000 mile service",
        });
        await addExpense({
          date: daysAgo(25),
          vendor: "Grainger",
          category: "consumables",
          description: "Safety glasses, work gloves, wire markers",
          amountCents: 12500,
          notes: "Quarterly safety equipment refresh",
        });
        await addExpense({
          date: daysAgo(30),
          vendor: "State of Illinois",
          category: "misc",
          description: "Annual electrical contractor license renewal",
          amountCents: 25000,
          notes: "License #EL-12345",
        });
        expensesAdded = 6;
      }

      const summary = [];
      if (customersAdded > 0) summary.push(`${customersAdded} customers`);
      if (inventoryAdded > 0) summary.push(`${inventoryAdded} inventory items`);
      if (jobsAdded > 0) summary.push(`${jobsAdded} jobs (with invoices & reminders)`);
      if (expensesAdded > 0) summary.push(`${expensesAdded} expenses`);

      toast({
        title: "Test data seeded successfully!",
        description: summary.length > 0 
          ? `Added: ${summary.join(", ")}` 
          : "Data already exists. Clear data first to re-seed.",
      });
    } catch (error) {
      console.error("Seed error:", error);
      toast({
        title: "Seed failed",
        description: error instanceof Error ? error.message : "Failed to seed test data",
        variant: "destructive",
      });
    } finally {
      setIsSeeding(false);
    }
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
        // Web fallback
        const blob = new Blob([data], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        toast({
          title: "Backup exported",
          description: "Your data has been downloaded.",
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

        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="font-semibold mb-2">Development Tools</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Seed test data to verify inventory and job tracking functionality.
          </p>
          <button 
            onClick={handleSeedTestData} 
            disabled={isSeeding}
            className="btn-secondary flex items-center gap-2"
          >
            <Database className="w-4 h-4" /> 
            {isSeeding ? "Seeding..." : "Seed Test Data"}
          </button>
          <p className="text-xs text-muted-foreground mt-2">
            Adds 3 sample customers and 5 inventory items if none exist.
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
