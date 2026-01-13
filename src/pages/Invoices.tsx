import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, DollarSign } from "lucide-react";
import { useStore } from "@/store/useStore";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { PaymentDialog } from "@/components/invoices/PaymentDialog";
import { centsToDollars } from "@/lib/db";
import { Invoice } from "@/types";

export default function Invoices() {
  const { invoices, customers, jobs } = useStore();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);

  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      if (statusFilter === "all") return true;
      return inv.paymentStatus === statusFilter;
    });
  }, [invoices, statusFilter]);

  const invoicesWithDetails = useMemo(() => {
    return filteredInvoices.map((invoice) => {
      const customer = customers.find((c) => c.id === invoice.customerId);
      const job = jobs.find((j) => j.id === invoice.jobId);
      const outstanding = invoice.totalCents - invoice.paidAmountCents;

      return {
        ...invoice,
        customerName: customer?.name || "Unknown",
        jobDescription: job?.problemDescription || "—",
        outstanding,
      };
    });
  }, [filteredInvoices, customers, jobs]);

  const columns = [
    {
      key: "invoiceNumber",
      header: "Invoice #",
      sortable: true,
      render: (inv: typeof invoicesWithDetails[0]) => (
        <span className="font-medium text-primary">{inv.invoiceNumber}</span>
      ),
    },
    {
      key: "invoiceDate",
      header: "Date",
      sortable: true,
      render: (inv: typeof invoicesWithDetails[0]) => (
        <span className="text-sm">
          {new Date(inv.invoiceDate).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: "customerName",
      header: "Customer",
      sortable: true,
    },
    {
      key: "jobDescription",
      header: "Job",
      render: (inv: typeof invoicesWithDetails[0]) => (
        <span className="text-sm text-muted-foreground">
          {inv.jobDescription.substring(0, 30)}
          {inv.jobDescription.length > 30 && "..."}
        </span>
      ),
    },
    {
      key: "totalCents",
      header: "Total",
      sortable: true,
      render: (inv: typeof invoicesWithDetails[0]) => (
        <span className="font-medium">${centsToDollars(inv.totalCents)}</span>
      ),
    },
    {
      key: "paidAmountCents",
      header: "Paid",
      render: (inv: typeof invoicesWithDetails[0]) => (
        <span className="text-success">${centsToDollars(inv.paidAmountCents)}</span>
      ),
    },
    {
      key: "outstanding",
      header: "Outstanding",
      sortable: true,
      render: (inv: typeof invoicesWithDetails[0]) => (
        <span
          className={inv.outstanding > 0 ? "text-warning font-medium" : "text-muted-foreground"}
        >
          ${centsToDollars(inv.outstanding)}
        </span>
      ),
    },
    {
      key: "paymentStatus",
      header: "Status",
      sortable: true,
      render: (inv: typeof invoicesWithDetails[0]) => (
        <span
          className={`status-badge ${
            inv.paymentStatus === "paid"
              ? "status-paid"
              : inv.paymentStatus === "partial"
              ? "status-partial"
              : "status-unpaid"
          }`}
        >
          {inv.paymentStatus}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (inv: typeof invoicesWithDetails[0]) =>
        inv.paymentStatus !== "paid" && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setSelectedInvoice(inv);
              setIsPaymentDialogOpen(true);
            }}
            className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors"
            title="Record Payment"
          >
            <DollarSign className="w-4 h-4" />
          </button>
        ),
    },
  ];

  // Calculate summary stats
  const totalOutstanding = invoicesWithDetails
    .filter((inv) => inv.paymentStatus !== "paid")
    .reduce((sum, inv) => sum + inv.outstanding, 0);

  const unpaidCount = invoicesWithDetails.filter((inv) => inv.paymentStatus !== "paid").length;

  return (
    <AppLayout>
      <PageHeader
        title="Invoices"
        description="View and manage all invoices"
      />

      {/* Summary */}
      <div className="flex items-center gap-6 mb-6 p-4 bg-card border border-border rounded-lg">
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-primary" />
          <div>
            <p className="text-sm text-muted-foreground">Total Outstanding</p>
            <p className="text-xl font-bold text-warning">
              ${centsToDollars(totalOutstanding)}
            </p>
          </div>
        </div>
        <div className="h-10 w-px bg-border" />
        <div>
          <p className="text-sm text-muted-foreground">Unpaid Invoices</p>
          <p className="text-xl font-bold">{unpaidCount}</p>
        </div>
      </div>

      {/* Status Filter */}
      <div className="flex gap-2 mb-4">
        {["all", "unpaid", "partial", "paid"].map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              statusFilter === status
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            {status === "all" ? "All" : status.charAt(0).toUpperCase() + status.slice(1)}
          </button>
        ))}
      </div>

      <DataTable
        data={invoicesWithDetails}
        columns={columns}
        keyField="id"
        searchable
        searchPlaceholder="Search invoices..."
        emptyMessage="No invoices yet. Invoices are automatically generated when jobs are completed."
      />

      {selectedInvoice && (
        <PaymentDialog
          open={isPaymentDialogOpen}
          onOpenChange={setIsPaymentDialogOpen}
          invoice={selectedInvoice}
        />
      )}
    </AppLayout>
  );
}
