import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useStore } from "@/store/useStore";
import { Invoice } from "@/types";
import { centsToDollars, dollarsToCents } from "@/lib/db";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const paymentSchema = z.object({
  amount: z.coerce.number().positive("Amount must be positive"),
  method: z.string().min(1, "Payment method required"),
  notes: z.string().max(500).optional(),
});

type PaymentFormData = z.infer<typeof paymentSchema>;

interface PaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: Invoice;
}

export function PaymentDialog({ open, onOpenChange, invoice }: PaymentDialogProps) {
  const { recordPayment } = useStore();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const outstanding = invoice.totalCents - invoice.paidAmountCents;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      amount: outstanding / 100,
      method: "cash",
      notes: "",
    },
  });

  const onSubmit = async (data: PaymentFormData) => {
    setIsSubmitting(true);
    try {
      await recordPayment(
        invoice.id,
        dollarsToCents(data.amount),
        data.method,
        data.notes
      );
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
          <DialogTitle>Record Payment</DialogTitle>
        </DialogHeader>

        <div className="mb-4 p-3 bg-secondary/50 rounded-lg">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Invoice</span>
            <span className="font-medium">{invoice.invoiceNumber}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total</span>
            <span>${centsToDollars(invoice.totalCents)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Paid</span>
            <span className="text-success">${centsToDollars(invoice.paidAmountCents)}</span>
          </div>
          <div className="flex justify-between font-medium border-t border-border pt-2 mt-2">
            <span>Outstanding</span>
            <span className="text-warning">${centsToDollars(outstanding)}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
            <label className="block text-sm font-medium mb-1">Payment Method *</label>
            <select {...register("method")} className="input-field w-full">
              <option value="cash">Cash</option>
              <option value="check">Check</option>
              <option value="credit_card">Credit Card</option>
              <option value="debit_card">Debit Card</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="venmo">Venmo</option>
              <option value="paypal">PayPal</option>
              <option value="other">Other</option>
            </select>
            {errors.method && (
              <p className="text-destructive text-xs mt-1">{errors.method.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <textarea
              {...register("notes")}
              className="input-field w-full min-h-[60px] resize-none"
              placeholder="Check number, reference, etc."
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
              {isSubmitting ? "Recording..." : "Record Payment"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
