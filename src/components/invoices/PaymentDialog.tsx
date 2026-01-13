import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowDownCircle, ArrowUpCircle, History } from "lucide-react";
import { useStore } from "@/store/useStore";
import { Invoice, Payment } from "@/types";
import { centsToDollars, dollarsToCents } from "@/lib/db";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  const { recordPayment, recordRefund, getPaymentsByInvoice } = useStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<"payment" | "refund" | "history">("payment");

  const outstanding = invoice.totalCents - invoice.paidAmountCents;
  const isOverpaid = invoice.paidAmountCents > invoice.totalCents;
  const overpaidAmount = isOverpaid ? invoice.paidAmountCents - invoice.totalCents : 0;
  const payments = getPaymentsByInvoice(invoice.id);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      amount: outstanding > 0 ? outstanding / 100 : 0,
      method: "cash",
      notes: "",
    },
  });

  const onSubmitPayment = async (data: PaymentFormData) => {
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

  const onSubmitRefund = async (data: PaymentFormData) => {
    setIsSubmitting(true);
    try {
      await recordRefund(
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-lg">
        <DialogHeader>
          <DialogTitle>Payment Management</DialogTitle>
        </DialogHeader>

        {/* Invoice Summary */}
        <div className="p-3 bg-secondary/50 rounded-lg space-y-1">
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
            <span>{isOverpaid ? "Overpaid" : "Outstanding"}</span>
            <span className={isOverpaid ? "text-primary" : "text-warning"}>
              ${centsToDollars(isOverpaid ? overpaidAmount : outstanding)}
            </span>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="payment" className="flex items-center gap-1">
              <ArrowDownCircle className="w-4 h-4" />
              Payment
            </TabsTrigger>
            <TabsTrigger value="refund" className="flex items-center gap-1">
              <ArrowUpCircle className="w-4 h-4" />
              Refund
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-1">
              <History className="w-4 h-4" />
              History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="payment" className="mt-4">
            <form onSubmit={handleSubmit(onSubmitPayment)} className="space-y-4">
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
                  <option value="zelle">Zelle</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Notes</label>
                <textarea
                  {...register("notes")}
                  className="input-field w-full min-h-[60px] resize-none"
                  placeholder="Check number, reference, etc."
                />
              </div>

              <div className="flex gap-3 pt-2">
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
          </TabsContent>

          <TabsContent value="refund" className="mt-4">
            <form onSubmit={handleSubmit(onSubmitRefund)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Refund Amount ($) *</label>
                <input
                  {...register("amount")}
                  type="number"
                  step="0.01"
                  max={invoice.paidAmountCents / 100}
                  className="input-field w-full"
                />
                {errors.amount && (
                  <p className="text-destructive text-xs mt-1">{errors.amount.message}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  Max refundable: ${centsToDollars(invoice.paidAmountCents)}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Refund Method *</label>
                <select {...register("method")} className="input-field w-full">
                  <option value="cash">Cash</option>
                  <option value="check">Check</option>
                  <option value="credit_card">Credit Card</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="original_method">Original Payment Method</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Reason for Refund</label>
                <textarea
                  {...register("notes")}
                  className="input-field w-full min-h-[60px] resize-none"
                  placeholder="Reason for refund..."
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || invoice.paidAmountCents === 0}
                  className="btn-primary flex-1 bg-warning hover:bg-warning/90"
                >
                  {isSubmitting ? "Processing..." : "Issue Refund"}
                </button>
              </div>
            </form>
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            {payments.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No payment history yet
              </div>
            ) : (
              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {payments.map((payment) => (
                  <div
                    key={payment.id}
                    className={`p-3 rounded-lg border ${
                      payment.type === "refund"
                        ? "bg-warning/10 border-warning/20"
                        : "bg-success/10 border-success/20"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        {payment.type === "refund" ? (
                          <ArrowUpCircle className="w-4 h-4 text-warning" />
                        ) : (
                          <ArrowDownCircle className="w-4 h-4 text-success" />
                        )}
                        <div>
                          <span className="font-medium">
                            {payment.type === "refund" ? "-" : "+"}${centsToDollars(payment.amountCents)}
                          </span>
                          <span className="text-sm text-muted-foreground ml-2 capitalize">
                            {payment.method.replace("_", " ")}
                          </span>
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(payment.date)}
                      </span>
                    </div>
                    {payment.notes && (
                      <p className="text-sm text-muted-foreground mt-1 ml-6">
                        {payment.notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
