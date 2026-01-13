import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useStore } from "@/store/useStore";
import { Expense } from "@/types";
import { dollarsToCents } from "@/lib/db";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const expenseSchema = z.object({
  date: z.string().min(1, "Date is required"),
  vendor: z.string().min(1, "Vendor is required").max(100),
  category: z.enum(["parts", "tools", "consumables", "vehicle", "fuel", "misc"]),
  description: z.string().min(1, "Description is required").max(200),
  amount: z.coerce.number().positive("Amount must be positive"),
  notes: z.string().max(500).optional(),
});

type ExpenseFormData = z.infer<typeof expenseSchema>;

interface ExpenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense?: Expense;
}

export function ExpenseDialog({ open, onOpenChange, expense }: ExpenseDialogProps) {
  const { addExpense, updateExpense } = useStore();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      date: new Date().toISOString().split("T")[0],
      vendor: "",
      category: "parts",
      description: "",
      amount: 0,
      notes: "",
    },
  });

  useEffect(() => {
    if (expense) {
      reset({
        date: expense.date.split("T")[0],
        vendor: expense.vendor,
        category: expense.category,
        description: expense.description,
        amount: expense.amountCents / 100,
        notes: expense.notes || "",
      });
    } else {
      reset({
        date: new Date().toISOString().split("T")[0],
        vendor: "",
        category: "parts",
        description: "",
        amount: 0,
        notes: "",
      });
    }
  }, [expense, reset, open]);

  const onSubmit = async (data: ExpenseFormData) => {
    setIsSubmitting(true);
    try {
      const expenseData = {
        date: data.date,
        vendor: data.vendor,
        category: data.category,
        description: data.description,
        amountCents: dollarsToCents(data.amount),
        notes: data.notes || "",
      };

      if (expense) {
        await updateExpense(expense.id, expenseData);
      } else {
        await addExpense(expenseData);
      }

      onOpenChange(false);
      reset();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle>{expense ? "Edit Expense" : "Add Expense"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Date *</label>
              <input
                {...register("date")}
                type="date"
                className="input-field w-full"
              />
              {errors.date && (
                <p className="text-destructive text-xs mt-1">{errors.date.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Category *</label>
              <select {...register("category")} className="input-field w-full">
                <option value="parts">Parts</option>
                <option value="tools">Tools</option>
                <option value="consumables">Consumables</option>
                <option value="vehicle">Vehicle</option>
                <option value="fuel">Fuel</option>
                <option value="misc">Miscellaneous</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Vendor *</label>
            <input
              {...register("vendor")}
              className="input-field w-full"
              placeholder="Store or supplier name"
            />
            {errors.vendor && (
              <p className="text-destructive text-xs mt-1">{errors.vendor.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description *</label>
            <input
              {...register("description")}
              className="input-field w-full"
              placeholder="What was purchased"
            />
            {errors.description && (
              <p className="text-destructive text-xs mt-1">{errors.description.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Amount ($) *</label>
            <input
              {...register("amount")}
              type="number"
              step="0.01"
              className="input-field w-full"
            />
            {errors.amount && (
              <p className="text-destructive text-xs mt-1">{errors.amount.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <textarea
              {...register("notes")}
              className="input-field w-full min-h-[60px] resize-none"
              placeholder="Additional details..."
            />
          </div>

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
              {isSubmitting ? "Saving..." : expense ? "Update" : "Add Expense"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
