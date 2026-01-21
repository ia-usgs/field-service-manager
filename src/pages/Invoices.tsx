import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, DollarSign, Download, Loader2, CheckSquare, Square } from "lucide-react";
import { jsPDF } from "jspdf";
import JSZip from "jszip";
import { useStore } from "@/store/useStore";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { PaymentDialog } from "@/components/invoices/PaymentDialog";
import { centsToDollars } from "@/lib/db";
import { logError, logInfo } from "@/lib/errorLogger";
import { Invoice, Customer, Job, AppSettings } from "@/types";
import defaultLogo from "@/assets/logo.png";

export default function Invoices() {
  const navigate = useNavigate();
  const { invoices, customers, jobs, settings } = useStore();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDownloading, setIsDownloading] = useState(false);

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

  const toggleSelection = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === invoicesWithDetails.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(invoicesWithDetails.map((inv) => inv.id)));
    }
  };

  const convertImageToDataUrl = (imageSrc: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL("image/png"));
        } else {
          reject(new Error("Failed to get canvas context"));
        }
      };
      img.onerror = () => reject(new Error("Failed to load logo image"));
      img.src = imageSrc;
    });
  };

  const generatePdfBlob = async (
    invoice: Invoice,
    logoDataUrl: string
  ): Promise<Blob> => {
    const customer = customers.find((c) => c.id === invoice.customerId);
    const job = jobs.find((j) => j.id === invoice.jobId);
    // Generate with jsPDF directly (more reliable than DOM-to-canvas in some environments)
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const left = 40;
    const right = 572;

    // Header
    try {
      doc.addImage(logoDataUrl, "PNG", left, 40, 56, 56);
    } catch {
      // ignore
    }

    const companyX = left + 72;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(settings?.companyName || "Tech & Electrical Services", companyX, 62);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const companyLines = [
      settings?.companyAddress,
      [settings?.companyPhone, settings?.companyEmail].filter(Boolean).join(" • "),
    ].filter(Boolean) as string[];
    companyLines.forEach((line, idx) => {
      doc.text(line, companyX, 78 + idx * 12);
    });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text("INVOICE", right, 62, { align: "right" });
    doc.setFontSize(12);
    doc.text(invoice.invoiceNumber, right, 82, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Date: ${new Date(invoice.invoiceDate).toLocaleDateString()}`, right, 98, { align: "right" });
    doc.text(`Due: ${new Date(invoice.dueDate).toLocaleDateString()}`, right, 112, { align: "right" });

    doc.setDrawColor(220);
    doc.setLineWidth(1);
    doc.line(left, 130, right, 130);

    // Bill To
    let y = 155;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Bill To", left, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    const billToLines = [
      customer?.name,
      customer?.address,
      customer?.email,
      customer?.phone,
    ].filter(Boolean) as string[];
    billToLines.forEach((line) => {
      doc.text(line, left, y);
      y += 12;
    });

    // Line items
    y = Math.max(y + 18, 250);
    doc.setFont("helvetica", "bold");
    doc.text("Description", left, y);
    doc.text("Qty", 420, y);
    doc.text("Amount", right, y, { align: "right" });
    y += 8;
    doc.setDrawColor(40);
    doc.setLineWidth(1.2);
    doc.line(left, y, right, y);
    y += 18;
    doc.setFont("helvetica", "normal");

    const items: Array<{ desc: string; qty: string; amount: string }> = [];
    if (invoice.laborTotalCents > 0) {
      items.push({
        desc: `Labor - ${job?.workPerformed || job?.problemDescription || "Service"}`,
        qty: `${job?.laborHours || 0} hrs`,
        amount: `$${centsToDollars(invoice.laborTotalCents)}`,
      });
    }
    (job?.parts || []).forEach((p) => {
      items.push({
        desc: p.name,
        qty: String(p.quantity),
        amount: `$${centsToDollars(p.quantity * p.unitPriceCents)}`,
      });
    });
    if (invoice.miscFeesCents > 0) {
      items.push({
        desc: job?.miscFeesDescription || "Miscellaneous Fees",
        qty: "1",
        amount: `$${centsToDollars(invoice.miscFeesCents)}`,
      });
    }

    items.forEach((it) => {
      if (y > 740) {
        doc.addPage();
        y = 60;
      }
      const descLines = doc.splitTextToSize(it.desc, 360);
      doc.text(descLines, left, y);
      doc.text(it.qty, 420, y);
      doc.text(it.amount, right, y, { align: "right" });
      y += 14 + (descLines.length - 1) * 10;
    });

    // Totals
    y += 16;
    doc.setDrawColor(40);
    doc.setLineWidth(1);
    doc.line(360, y, right, y);
    y += 18;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(`Total  $${centsToDollars(invoice.totalCents)}`, right, y, { align: "right" });
    y += 16;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    if (invoice.paidAmountCents > 0) {
      doc.text(`Paid  $${centsToDollars(invoice.paidAmountCents)}`, right, y, { align: "right" });
      y += 12;
    }
    if (invoice.paymentStatus !== "paid") {
      doc.setFont("helvetica", "bold");
      doc.text(
        `Balance Due  $${centsToDollars(invoice.totalCents - invoice.paidAmountCents)}`,
        right,
        y,
        { align: "right" }
      );
    }

    return doc.output("blob") as Blob;
  };

  const handleBatchDownload = async () => {
    if (selectedIds.size === 0) return;

    setIsDownloading(true);
    const selectedInvoices = invoices.filter((inv) => selectedIds.has(inv.id));

    try {
      await logInfo(`Starting batch PDF generation for ${selectedInvoices.length} invoices`, "Invoices");
      
      // Use custom logo from settings, or fall back to default
      const logoSrc = settings?.companyLogo || defaultLogo;
      const logoDataUrl = settings?.companyLogo 
        ? settings.companyLogo  // Already a data URL
        : await convertImageToDataUrl(logoSrc);
      const zip = new JSZip();

      for (const invoice of selectedInvoices) {
        try {
          const pdfBlob = await generatePdfBlob(invoice, logoDataUrl);
          zip.file(`${invoice.invoiceNumber}.pdf`, pdfBlob);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          await logError(`Failed to generate PDF for invoice ${invoice.invoiceNumber}: ${errorMessage}`, {
            source: "Invoices",
            stack: error instanceof Error ? error.stack : undefined,
          });
        }
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoices-${new Date().toISOString().split("T")[0]}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      await logInfo(`Successfully generated ZIP with ${selectedInvoices.length} invoices`, "Invoices");
      setSelectedIds(new Set());
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await logError(`Failed to generate batch PDF download: ${errorMessage}`, {
        source: "Invoices",
        stack: error instanceof Error ? error.stack : undefined,
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const columns = [
    {
      key: "select",
      header: () => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleSelectAll();
          }}
          className="p-1 hover:bg-secondary rounded transition-colors"
        >
          {selectedIds.size === invoicesWithDetails.length && invoicesWithDetails.length > 0 ? (
            <CheckSquare className="w-4 h-4 text-primary" />
          ) : (
            <Square className="w-4 h-4 text-muted-foreground" />
          )}
        </button>
      ),
      render: (inv: typeof invoicesWithDetails[0]) => (
        <button
          onClick={(e) => toggleSelection(inv.id, e)}
          className="p-1 hover:bg-secondary rounded transition-colors"
        >
          {selectedIds.has(inv.id) ? (
            <CheckSquare className="w-4 h-4 text-primary" />
          ) : (
            <Square className="w-4 h-4 text-muted-foreground" />
          )}
        </button>
      ),
    },
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
        
        {/* Batch Download Button */}
        {selectedIds.size > 0 && (
          <>
            <div className="h-10 w-px bg-border" />
            <button
              onClick={handleBatchDownload}
              disabled={isDownloading}
              className="btn-primary flex items-center gap-2"
            >
              {isDownloading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Download {selectedIds.size} PDF{selectedIds.size > 1 ? "s" : ""}
                </>
              )}
            </button>
          </>
        )}
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
        onRowClick={(inv) => navigate(`/invoices/${inv.id}`)}
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
