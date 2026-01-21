import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, DollarSign, Download, Loader2, CheckSquare, Square } from "lucide-react";
import html2pdf from "html2pdf.js";
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

// HTML-encode special characters to prevent XSS/injection in PDF generation
const encodeHTML = (str: string | undefined): string => {
  if (!str) return "";
  return str.replace(/[<>&"']/g, (c) => {
    const entities: Record<string, string> = {
      '<': '&lt;',
      '>': '&gt;',
      '&': '&amp;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return entities[c] || c;
  });
};

const generateInvoiceMarkup = (
  invoice: Invoice,
  customer: Customer | undefined,
  job: Job | undefined,
  settings: AppSettings | null,
  logoDataUrl: string
) => {
  // NOTE: This returns markup intended to be injected into a container <div>.
  // Avoid wrapping with <html>/<head>/<body> because those tags won't behave
  // correctly when inserted via innerHTML into a div.
  return `
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      padding: 40px;
      color: #1a1a1a;
      background: white;
    }
    .invoice-container { max-width: 800px; margin: 0 auto; }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 40px;
      padding-bottom: 20px;
      border-bottom: 2px solid #e5e5e5;
    }
    .logo-section { display: flex; align-items: center; gap: 16px; }
    .logo-img { width: 80px; height: 80px; object-fit: contain; }
    .company-name { font-size: 24px; font-weight: bold; color: #1a1a1a; }
    .company-details { font-size: 12px; color: #666; margin-top: 4px; }
    .invoice-title { text-align: right; }
    .invoice-title h1 { font-size: 32px; color: #1a1a1a; margin-bottom: 8px; }
    .invoice-number { font-size: 16px; color: #666; }
    .invoice-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 40px; }
    .meta-section h3 { font-size: 12px; text-transform: uppercase; color: #666; margin-bottom: 8px; }
    .meta-section p { font-size: 14px; line-height: 1.6; }
    .line-items { margin-bottom: 30px; }
    .line-items table { width: 100%; border-collapse: collapse; }
    .line-items th {
      text-align: left;
      padding: 12px 8px;
      border-bottom: 2px solid #1a1a1a;
      font-size: 12px;
      text-transform: uppercase;
      color: #666;
    }
    .line-items th:last-child { text-align: right; }
    .line-items td { padding: 12px 8px; border-bottom: 1px solid #e5e5e5; font-size: 14px; }
    .line-items td:last-child { text-align: right; }
    .totals { margin-left: auto; width: 250px; }
    .totals-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 14px; }
    .totals-row.total {
      border-top: 2px solid #1a1a1a;
      margin-top: 8px;
      padding-top: 12px;
      font-size: 18px;
      font-weight: bold;
    }
    .status-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .status-paid { background: #22c55e20; color: #16a34a; }
    .status-partial { background: #f59e0b20; color: #d97706; }
    .status-unpaid { background: #ef444420; color: #dc2626; }
    .footer {
      margin-top: 60px;
      padding-top: 20px;
      border-top: 1px solid #e5e5e5;
      text-align: center;
      font-size: 12px;
      color: #666;
    }
  </style>

  <div class="invoice-container">
    <div class="header">
      <div class="logo-section">
        <img src="${logoDataUrl}" alt="Logo" class="logo-img" />
        <div>
          <div class="company-name">${encodeHTML(settings?.companyName || "Tech & Electrical Services")}</div>
          <div class="company-details">
            ${encodeHTML(settings?.companyAddress || "")}<br/>
            ${encodeHTML(settings?.companyPhone || "")} • ${encodeHTML(settings?.companyEmail || "")}
          </div>
        </div>
      </div>
      <div class="invoice-title">
        <h1>INVOICE</h1>
        <div class="invoice-number">${encodeHTML(invoice.invoiceNumber)}</div>
      </div>
    </div>

    <div class="invoice-meta">
      <div class="meta-section">
        <h3>Bill To</h3>
        <p>
          <strong>${encodeHTML(customer?.name || "Customer")}</strong><br/>
          ${encodeHTML(customer?.address || "")}<br/>
          ${encodeHTML(customer?.email || "")}<br/>
          ${encodeHTML(customer?.phone || "")}
        </p>
      </div>
      <div class="meta-section" style="text-align: right;">
        <h3>Invoice Details</h3>
        <p>
          <strong>Invoice Date:</strong> ${new Date(invoice.invoiceDate).toLocaleDateString()}<br/>
          <strong>Due Date:</strong> ${new Date(invoice.dueDate).toLocaleDateString()}<br/>
          <strong>Status:</strong> <span class="status-badge status-${invoice.paymentStatus}">${invoice.paymentStatus}</span>
        </p>
      </div>
    </div>

    <div class="line-items">
      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th style="width: 100px;">Qty</th>
            <th style="width: 120px; text-align: right;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${invoice.laborTotalCents > 0 ? `
          <tr>
            <td>Labor - ${encodeHTML(job?.workPerformed || job?.problemDescription || "Service")}</td>
            <td>${job?.laborHours || 0} hrs</td>
            <td>$${centsToDollars(invoice.laborTotalCents)}</td>
          </tr>
          ` : ""}
          ${job?.parts.map((part) => `
          <tr>
            <td>${encodeHTML(part.name)}</td>
            <td>${part.quantity}</td>
            <td>$${centsToDollars(part.quantity * part.unitPriceCents)}</td>
          </tr>
          `).join("") || ""}
          ${invoice.miscFeesCents > 0 ? `
          <tr>
            <td>${encodeHTML(job?.miscFeesDescription || "Miscellaneous Fees")}</td>
            <td>1</td>
            <td>$${centsToDollars(invoice.miscFeesCents)}</td>
          </tr>
          ` : ""}
        </tbody>
      </table>
    </div>

    <div class="totals">
      <div class="totals-row">
        <span>Subtotal</span>
        <span>$${centsToDollars(invoice.subtotalCents)}</span>
      </div>
      <div class="totals-row">
        <span>Tax</span>
        <span>$${centsToDollars(invoice.taxCents)}</span>
      </div>
      <div class="totals-row total">
        <span>Total</span>
        <span>$${centsToDollars(invoice.totalCents)}</span>
      </div>
      ${invoice.paidAmountCents > 0 ? `
      <div class="totals-row" style="color: #16a34a;">
        <span>Paid</span>
        <span>$${centsToDollars(invoice.paidAmountCents)}</span>
      </div>
      ` : ""}
      ${invoice.paymentStatus !== "paid" ? `
      <div class="totals-row" style="color: #dc2626; font-weight: bold;">
        <span>Balance Due</span>
        <span>$${centsToDollars(invoice.totalCents - invoice.paidAmountCents)}</span>
      </div>
      ` : ""}
    </div>

    <div class="footer">
      <p>Thank you for your business!</p>
      <p style="margin-top: 8px;">${encodeHTML(settings?.companyName || "Tech & Electrical Services")}</p>
    </div>
  </div>
`;
};

const waitForImages = async (root: HTMLElement) => {
  const imgs = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if ((img as HTMLImageElement).complete) return resolve();
          img.addEventListener("load", () => resolve(), { once: true });
          img.addEventListener("error", () => resolve(), { once: true });
        })
    )
  );
};

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
    const markup = generateInvoiceMarkup(invoice, customer, job, settings, logoDataUrl);

    const container = document.createElement("div");
    container.innerHTML = markup;
    // Keep it in-document so html2canvas can compute layout, but invisible.
    container.style.position = "fixed";
    container.style.top = "0";
    container.style.left = "0";
    container.style.opacity = "0";
    container.style.pointerEvents = "none";
    container.style.zIndex = "-1";
    container.style.width = "850px";
    container.style.background = "white";
    document.body.appendChild(container);

    try {
      // Ensure images are fully loaded before rendering to canvas/PDF
      await waitForImages(container);
      // Let the browser perform a layout pass
      await new Promise((r) => requestAnimationFrame(() => r(null)));

      const opt = {
        margin: 0,
        filename: `${invoice.invoiceNumber}.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: "in", format: "letter", orientation: "portrait" },
      };

      // Use toPdf().get('pdf') to get the jsPDF instance, then output as blob
      const pdfInstance = await html2pdf()
        .set(opt)
        .from(container)
        .toPdf()
        .get("pdf");
      
      const pdfBlob = (pdfInstance as any).output("blob");
      return pdfBlob as Blob;
    } finally {
      document.body.removeChild(container);
    }
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
