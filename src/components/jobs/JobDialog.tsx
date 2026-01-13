import { useState, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Trash2, Bell } from "lucide-react";
import { useStore } from "@/store/useStore";
import { Job, Part, Reminder } from "@/types";
import { dollarsToCents } from "@/lib/db";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const partSchema = z.object({
  name: z.string().min(1, "Part name required"),
  quantity: z.coerce.number().min(1),
  unitCost: z.coerce.number().min(0),
  unitPrice: z.coerce.number().min(0),
});

const reminderPresetSchema = z.object({
  enabled: z.boolean(),
  type: z.enum(["follow-up", "maintenance", "annual-checkup", "custom"]),
  title: z.string(),
  daysFromNow: z.coerce.number().optional(),
  customDate: z.string().optional(),
});

const jobSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  dateOfService: z.string().min(1, "Date is required"),
  problemDescription: z.string().min(1, "Problem description required").max(500),
  workPerformed: z.string().max(1000).optional(),
  laborHours: z.coerce.number().min(0),
  laborRate: z.coerce.number().min(0),
  parts: z.array(partSchema).optional(),
  miscFees: z.coerce.number().min(0).optional(),
  miscFeesDescription: z.string().max(200).optional(),
  taxRate: z.coerce.number().min(0).max(100),
  technicianNotes: z.string().max(1000).optional(),
  status: z.enum(["quoted", "in-progress", "completed"]),
  reminders: z.array(reminderPresetSchema).optional(),
});

type JobFormData = z.infer<typeof jobSchema>;

interface JobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job?: Job;
  customerId?: string;
}

const defaultReminders = [
  { enabled: false, type: "follow-up" as const, title: "Follow-up service check", daysFromNow: 30 },
  { enabled: false, type: "maintenance" as const, title: "Scheduled maintenance", daysFromNow: 90 },
  { enabled: false, type: "annual-checkup" as const, title: "Annual checkup due", daysFromNow: 365 },
];

export function JobDialog({ open, onOpenChange, job, customerId }: JobDialogProps) {
  const { addJob, updateJob, completeJob, customers, settings, addReminder, getRemindersByJob } = useStore();
  const existingReminders = job ? getRemindersByJob(job.id) : [];
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    formState: { errors },
  } = useForm<JobFormData>({
    resolver: zodResolver(jobSchema),
    defaultValues: {
      customerId: customerId || "",
      dateOfService: new Date().toISOString().split("T")[0],
      problemDescription: "",
      workPerformed: "",
      laborHours: 0,
      laborRate: settings ? settings.defaultLaborRateCents / 100 : 85,
      parts: [],
      miscFees: 0,
      miscFeesDescription: "",
      taxRate: settings?.defaultTaxRate || 8.25,
      technicianNotes: "",
      status: "quoted",
      reminders: defaultReminders,
    },
  });

  const { fields: partFields, append: appendPart, remove: removePart } = useFieldArray({
    control,
    name: "parts",
  });

  const { fields: reminderFields, update: updateReminder } = useFieldArray({
    control,
    name: "reminders",
  });

  useEffect(() => {
    if (job) {
      reset({
        customerId: job.customerId,
        dateOfService: job.dateOfService.split("T")[0],
        problemDescription: job.problemDescription,
        workPerformed: job.workPerformed,
        laborHours: job.laborHours,
        laborRate: job.laborRateCents / 100,
        parts: job.parts.map((p) => ({
          name: p.name,
          quantity: p.quantity,
          unitCost: p.unitCostCents / 100,
          unitPrice: p.unitPriceCents / 100,
        })),
        miscFees: job.miscFeesCents / 100,
        miscFeesDescription: job.miscFeesDescription,
        taxRate: job.taxRate,
        technicianNotes: job.technicianNotes,
        status: job.status === "invoiced" || job.status === "paid" ? "completed" : job.status,
        reminders: defaultReminders, // Already created reminders managed separately
      });
    } else {
      reset({
        customerId: customerId || "",
        dateOfService: new Date().toISOString().split("T")[0],
        problemDescription: "",
        workPerformed: "",
        laborHours: 0,
        laborRate: settings ? settings.defaultLaborRateCents / 100 : 85,
        parts: [],
        miscFees: 0,
        miscFeesDescription: "",
        taxRate: settings?.defaultTaxRate || 8.25,
        technicianNotes: "",
        status: "quoted",
        reminders: defaultReminders,
      });
    }
  }, [job, customerId, reset, open, settings]);

  const watchedValues = watch();
  const laborTotal = (watchedValues.laborHours || 0) * (watchedValues.laborRate || 0);
  const partsTotal = (watchedValues.parts || []).reduce(
    (sum, part) => sum + (part.quantity || 0) * (part.unitPrice || 0),
    0
  );
  const subtotal = laborTotal + partsTotal + (watchedValues.miscFees || 0);
  const tax = subtotal * ((watchedValues.taxRate || 0) / 100);
  const total = subtotal + tax;

  const onSubmit = async (data: JobFormData) => {
    setIsSubmitting(true);
    try {
      const parts: Part[] = (data.parts || []).map((p, i) => ({
        id: `part-${i}`,
        name: p.name,
        quantity: p.quantity,
        unitCostCents: dollarsToCents(p.unitCost),
        unitPriceCents: dollarsToCents(p.unitPrice),
      }));

      const jobData = {
        customerId: data.customerId,
        dateOfService: data.dateOfService,
        problemDescription: data.problemDescription,
        workPerformed: data.workPerformed || "",
        laborHours: data.laborHours,
        laborRateCents: dollarsToCents(data.laborRate),
        parts,
        miscFeesCents: dollarsToCents(data.miscFees || 0),
        miscFeesDescription: data.miscFeesDescription || "",
        taxRate: data.taxRate,
        technicianNotes: data.technicianNotes || "",
        status: data.status as Job["status"],
      };

      let targetJobId: string;

      if (job) {
        await updateJob(job.id, jobData);
        targetJobId = job.id;
        
        // If status changed to completed, auto-generate invoice
        if (data.status === "completed" && job.status !== "completed" && job.status !== "invoiced" && job.status !== "paid") {
          await completeJob(job.id);
        }
      } else {
        const newJob = await addJob(jobData);
        targetJobId = newJob.id;
        
        // Create reminders for new jobs
        const enabledReminders = (data.reminders || []).filter((r) => r.enabled);
        for (const reminder of enabledReminders) {
          let dueDate: string;
          if (reminder.customDate) {
            dueDate = reminder.customDate;
          } else {
            const date = new Date();
            date.setDate(date.getDate() + (reminder.daysFromNow || 30));
            dueDate = date.toISOString().split("T")[0];
          }

          await addReminder({
            jobId: targetJobId,
            customerId: data.customerId,
            type: reminder.type,
            title: reminder.title,
            description: "",
            dueDate,
          });
        }
        
        // If created as completed, auto-generate invoice
        if (data.status === "completed") {
          await completeJob(newJob.id);
        }
      }

      onOpenChange(false);
      reset();
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeCustomers = customers.filter((c) => !c.archived);
  const isLocked = job && (job.status === "invoiced" || job.status === "paid");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {job ? (isLocked ? "View Job" : "Edit Job") : "Create New Job"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Customer & Date */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Customer *</label>
              <select
                {...register("customerId")}
                className="input-field w-full"
                disabled={isLocked || !!customerId}
              >
                <option value="">Select customer...</option>
                {activeCustomers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {errors.customerId && (
                <p className="text-destructive text-xs mt-1">{errors.customerId.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Date of Service *</label>
              <input
                {...register("dateOfService")}
                type="date"
                className="input-field w-full"
                disabled={isLocked}
              />
            </div>
          </div>

          {/* Problem & Work */}
          <div>
            <label className="block text-sm font-medium mb-1">Problem Description *</label>
            <textarea
              {...register("problemDescription")}
              className="input-field w-full min-h-[60px] resize-none"
              placeholder="What was wrong?"
              disabled={isLocked}
            />
            {errors.problemDescription && (
              <p className="text-destructive text-xs mt-1">{errors.problemDescription.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Work Performed</label>
            <textarea
              {...register("workPerformed")}
              className="input-field w-full min-h-[60px] resize-none"
              placeholder="What was done?"
              disabled={isLocked}
            />
          </div>

          {/* Labor */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Labor Hours</label>
              <input
                {...register("laborHours")}
                type="number"
                step="0.25"
                className="input-field w-full"
                disabled={isLocked}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Rate ($/hr)</label>
              <input
                {...register("laborRate")}
                type="number"
                step="0.01"
                className="input-field w-full"
                disabled={isLocked}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Labor Total</label>
              <div className="input-field w-full bg-secondary/50">
                ${laborTotal.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Parts */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">Parts</label>
              {!isLocked && (
                <button
                  type="button"
                  onClick={() => appendPart({ name: "", quantity: 1, unitCost: 0, unitPrice: 0 })}
                  className="text-primary text-sm flex items-center gap-1 hover:underline"
                >
                  <Plus className="w-4 h-4" />
                  Add Part
                </button>
              )}
            </div>
            {partFields.map((field, index) => (
              <div key={field.id} className="grid grid-cols-5 gap-2 mb-2">
                <input
                  {...register(`parts.${index}.name`)}
                  placeholder="Part name"
                  className="input-field col-span-2"
                  disabled={isLocked}
                />
                <input
                  {...register(`parts.${index}.quantity`)}
                  type="number"
                  placeholder="Qty"
                  className="input-field"
                  disabled={isLocked}
                />
                <input
                  {...register(`parts.${index}.unitPrice`)}
                  type="number"
                  step="0.01"
                  placeholder="Price"
                  className="input-field"
                  disabled={isLocked}
                />
                {!isLocked && (
                  <button
                    type="button"
                    onClick={() => removePart(index)}
                    className="p-2 text-destructive hover:bg-destructive/10 rounded"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Misc Fees */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Misc Fees ($)</label>
              <input
                {...register("miscFees")}
                type="number"
                step="0.01"
                className="input-field w-full"
                disabled={isLocked}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <input
                {...register("miscFeesDescription")}
                className="input-field w-full"
                placeholder="Travel, disposal, etc."
                disabled={isLocked}
              />
            </div>
          </div>

          {/* Tax & Status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Tax Rate (%)</label>
              <input
                {...register("taxRate")}
                type="number"
                step="0.01"
                className="input-field w-full"
                disabled={isLocked}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Status</label>
              <select
                {...register("status")}
                className="input-field w-full"
                disabled={isLocked}
              >
                <option value="quoted">Quoted</option>
                <option value="in-progress">In Progress</option>
                <option value="completed">Completed (Generate Invoice)</option>
              </select>
            </div>
          </div>

          {/* Service Reminders */}
          <div className="border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Bell className="w-4 h-4 text-primary" />
              <label className="text-sm font-medium">
                {job ? "Existing Reminders" : "Schedule Service Reminders"}
              </label>
            </div>

            {/* Show existing reminders for editing */}
            {job && existingReminders.length > 0 && (
              <div className="space-y-2 mb-4">
                {existingReminders.map((reminder) => (
                  <div
                    key={reminder.id}
                    className={`p-3 rounded-lg border ${
                      reminder.completed
                        ? "bg-success/10 border-success/20"
                        : "bg-secondary/50 border-border"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          reminder.type === "follow-up"
                            ? "bg-primary/20 text-primary"
                            : reminder.type === "maintenance"
                            ? "bg-warning/20 text-warning"
                            : "bg-success/20 text-success"
                        }`}>
                          {reminder.type.replace("-", " ")}
                        </span>
                        <p className="font-medium text-sm mt-1">{reminder.title}</p>
                        <p className="text-xs text-muted-foreground">
                          Due: {new Date(reminder.dueDate).toLocaleDateString()}
                        </p>
                      </div>
                      {reminder.completed && (
                        <span className="text-xs text-success">✓ Completed</span>
                      )}
                    </div>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  To add or edit reminders, use the Reminders button on the Job Detail page.
                </p>
              </div>
            )}

            {job && existingReminders.length === 0 && (
              <p className="text-sm text-muted-foreground mb-3">
                No reminders set. Use the Reminders button on the Job Detail page to add some.
              </p>
            )}

            {/* Show reminder presets for new jobs */}
            {!job && (
              <>
                <div className="space-y-3">
                  {reminderFields.map((field, index) => {
                    const watchedReminder = watch(`reminders.${index}`);
                    return (
                      <div
                        key={field.id}
                        className={`p-3 rounded-lg border transition-colors ${
                          watchedReminder?.enabled
                            ? "bg-primary/10 border-primary/30"
                            : "bg-secondary/30 border-border"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            {...register(`reminders.${index}.enabled`)}
                            className="w-4 h-4 rounded border-border"
                          />
                          <div className="flex-1">
                            <input
                              {...register(`reminders.${index}.title`)}
                              className="input-field w-full text-sm"
                              placeholder="Reminder title"
                            />
                          </div>
                        </div>
                        {watchedReminder?.enabled && (
                          <div className="mt-3 ml-7 flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">Due in:</span>
                            <select
                              value={watchedReminder.daysFromNow || "custom"}
                              onChange={(e) => {
                                const value = e.target.value;
                                if (value === "custom") {
                                  updateReminder(index, { ...watchedReminder, daysFromNow: undefined });
                                } else {
                                  updateReminder(index, {
                                    ...watchedReminder,
                                    daysFromNow: parseInt(value),
                                    customDate: undefined,
                                  });
                                }
                              }}
                              className="input-field text-sm py-1"
                            >
                              <option value={30}>30 days</option>
                              <option value={60}>60 days</option>
                              <option value={90}>90 days</option>
                              <option value={180}>6 months</option>
                              <option value={365}>1 year</option>
                              <option value="custom">Custom date</option>
                            </select>
                            {!watchedReminder.daysFromNow && (
                              <input
                                type="date"
                                {...register(`reminders.${index}.customDate`)}
                                min={new Date().toISOString().split("T")[0]}
                                className="input-field text-sm py-1"
                              />
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  Reminders will appear on your dashboard when due
                </p>
              </>
            )}
          </div>

          {/* Technician Notes */}
          <div>
            <label className="block text-sm font-medium mb-1">Technician Notes</label>
            <textarea
              {...register("technicianNotes")}
              className="input-field w-full min-h-[60px] resize-none"
              placeholder="Internal notes..."
            />
          </div>

          {/* Totals */}
          <div className="bg-secondary/50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span>${subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Tax ({watchedValues.taxRate}%)</span>
              <span>${tax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-semibold text-lg border-t border-border pt-2">
              <span>Total</span>
              <span className="text-primary">${total.toFixed(2)}</span>
            </div>
          </div>

          {/* Actions */}
          {!isLocked && (
            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-primary flex-1"
              >
                {isSubmitting ? "Saving..." : job ? "Update Job" : "Create Job"}
              </button>
            </div>
          )}

          {isLocked && (
            <p className="text-sm text-muted-foreground text-center">
              This job is locked because an invoice has been generated.
            </p>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
