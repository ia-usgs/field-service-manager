import { useState, useRef } from "react";
import html2pdf from "html2pdf.js";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Download, Mail, DollarSign } from "lucide-react";
import { useStore } from "@/store/useStore";
import { AppLayout } from "@/components/layout/AppLayout";
import { PaymentDialog } from "@/components/invoices/PaymentDialog";
import { centsToDollars } from "@/lib/db";
import { logError, logInfo } from "@/lib/errorLogger";
import defaultLogo from "@/assets/logo.png";

export default function InvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { invoices, customers, jobs, settings } = useStore();
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const invoice = invoices.find((i) => i.id === id);
  const customer = invoice ? customers.find((c) => c.id === invoice.customerId) : null;
  const job = invoice ? jobs.find((j) => j.id === invoice.jobId) : null;

  if (!invoice) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">Invoice not found</p>
        </div>
      </AppLayout>
    );
  }

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

  const generateInvoiceHTML = (logoDataUrl: string) => {
    return `<!DOCTYPE html>
<html>
<head>
  <title>Invoice ${encodeHTML(invoice.invoiceNumber)}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      padding: 40px;
      color: #1a1a1a;
      background: white;
    }
    .invoice-container {
      max-width: 800px;
      margin: 0 auto;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 40px;
      padding-bottom: 20px;
      border-bottom: 2px solid #e5e5e5;
    }
    .logo-section {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .logo-img {
      width: 80px;
      height: 80px;
      object-fit: contain;
    }
    .company-name {
      font-size: 24px;
      font-weight: bold;
      color: #1a1a1a;
    }
    .company-details {
      font-size: 12px;
      color: #666;
      margin-top: 4px;
    }
    .invoice-title {
      text-align: right;
    }
    .invoice-title h1 {
      font-size: 32px;
      color: #1a1a1a;
      margin-bottom: 8px;
    }
    .invoice-number {
      font-size: 16px;
      color: #666;
    }
    .invoice-meta {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 40px;
      margin-bottom: 40px;
    }
    .meta-section h3 {
      font-size: 12px;
      text-transform: uppercase;
      color: #666;
      margin-bottom: 8px;
    }
    .meta-section p {
      font-size: 14px;
      line-height: 1.6;
    }
    .line-items {
      margin-bottom: 30px;
    }
    .line-items table {
      width: 100%;
      border-collapse: collapse;
    }
    .line-items th {
      text-align: left;
      padding: 12px 8px;
      border-bottom: 2px solid #1a1a1a;
      font-size: 12px;
      text-transform: uppercase;
      color: #666;
    }
    .line-items th:last-child {
      text-align: right;
    }
    .line-items td {
      padding: 12px 8px;
      border-bottom: 1px solid #e5e5e5;
      font-size: 14px;
    }
    .line-items td:last-child {
      text-align: right;
    }
    .totals {
      margin-left: auto;
      width: 250px;
    }
    .totals-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      font-size: 14px;
    }
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
    .status-paid {
      background: #22c55e20;
      color: #16a34a;
    }
    .status-partial {
      background: #f59e0b20;
      color: #d97706;
    }
    .status-unpaid {
      background: #ef444420;
      color: #dc2626;
    }
    .footer {
      margin-top: 60px;
      padding-top: 20px;
      border-top: 1px solid #e5e5e5;
      text-align: center;
      font-size: 12px;
      color: #666;
    }
    @media print {
      body { padding: 20px; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
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
</body>
</html>`;
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

  const handleDownloadInvoice = async () => {
    let container: HTMLDivElement | null = null;
    
    try {
      await logInfo(`Starting PDF generation for invoice ${invoice.invoiceNumber}`, "InvoiceDetail");
      
      // Use custom logo from settings, or fall back to default
      const logoSrc = settings?.companyLogo || defaultLogo;
      const logoDataUrl = settings?.companyLogo 
        ? settings.companyLogo  // Already a data URL
        : await convertImageToDataUrl(logoSrc);
      const html = generateInvoiceHTML(logoDataUrl);
      
      // Create a temporary container to render the HTML
      container = document.createElement("div");
      container.innerHTML = html;
      container.style.position = "absolute";
      container.style.left = "-9999px";
      document.body.appendChild(container);

      const opt = {
        margin: 0,
        filename: `${invoice.invoiceNumber}.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: "in", format: "letter", orientation: "portrait" },
      };

      await html2pdf().set(opt).from(container).save();
      await logInfo(`Successfully generated PDF for invoice ${invoice.invoiceNumber}`, "InvoiceDetail");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await logError(`Failed to generate PDF for invoice ${invoice.invoiceNumber}: ${errorMessage}`, {
        source: "InvoiceDetail",
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    } finally {
      if (container && document.body.contains(container)) {
        document.body.removeChild(container);
      }
    }
  };

  const handleEmailInvoice = () => {
    // First download the invoice, then open email client
    handleDownloadInvoice();
    
    const subject = encodeURIComponent(`Invoice ${invoice.invoiceNumber} from ${settings?.companyName || "Tech & Electrical Services"}`);
    const body = encodeURIComponent(
      `Dear ${customer?.name || "Customer"},\n\n` +
      `Please find attached invoice ${invoice.invoiceNumber} for $${centsToDollars(invoice.totalCents)}.\n\n` +
      `Invoice Date: ${new Date(invoice.invoiceDate).toLocaleDateString()}\n` +
      `Due Date: ${new Date(invoice.dueDate).toLocaleDateString()}\n\n` +
      `(The invoice file has been downloaded to your Downloads folder - please attach it to this email.)\n\n` +
      `Thank you for your business!\n\n` +
      `${settings?.companyName || "Tech & Electrical Services"}\n` +
      `${settings?.companyPhone || ""}\n` +
      `${settings?.companyEmail || ""}`
    );
    window.location.href = `mailto:${customer?.email || ""}?subject=${subject}&body=${body}`;
  };


  return (
    <AppLayout>
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate("/invoices")}
          className="p-2 hover:bg-secondary rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{invoice.invoiceNumber}</h1>
            <span
              className={`status-badge ${
                invoice.paymentStatus === "paid"
                  ? "status-paid"
                  : invoice.paymentStatus === "partial"
                  ? "status-partial"
                  : "status-unpaid"
              }`}
            >
              {invoice.paymentStatus}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {new Date(invoice.invoiceDate).toLocaleDateString()} •{" "}
            <button
              onClick={() => navigate(`/customers/${customer?.id}`)}
              className="text-primary hover:underline"
            >
              {customer?.name || "Unknown Customer"}
            </button>
          </p>
        </div>
        <button
          onClick={handleDownloadInvoice}
          className="btn-secondary flex items-center gap-2"
        >
          <Download className="w-4 h-4" />
          Download
        </button>
        {customer?.email && (
          <button
            onClick={handleEmailInvoice}
            className="btn-secondary flex items-center gap-2"
          >
            <Mail className="w-4 h-4" />
            Email
          </button>
        )}
        {invoice.paymentStatus !== "paid" && (
          <button
            onClick={() => setIsPaymentDialogOpen(true)}
            className="btn-primary flex items-center gap-2"
          >
            <DollarSign className="w-4 h-4" />
            Record Payment
          </button>
        )}
      </div>

      {/* Invoice Preview */}
      <div
        ref={printRef}
        className="bg-white text-gray-900 rounded-lg shadow-lg p-8 max-w-4xl mx-auto"
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-8 pb-6 border-b-2 border-gray-200">
          <div className="flex items-center gap-4">
            <img src={settings?.companyLogo || defaultLogo} alt="Company Logo" className="w-20 h-20 object-contain" />
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                {settings?.companyName || "Tech & Electrical Services"}
              </h2>
              <p className="text-sm text-gray-600">
                {settings?.companyAddress}
              </p>
              <p className="text-sm text-gray-600">
                {settings?.companyPhone} • {settings?.companyEmail}
              </p>
            </div>
          </div>
          <div className="text-right">
            <h1 className="text-3xl font-bold text-gray-900">INVOICE</h1>
            <p className="text-lg text-gray-600">{invoice.invoiceNumber}</p>
          </div>
        </div>

        {/* Meta */}
        <div className="grid grid-cols-2 gap-8 mb-8">
          <div>
            <h3 className="text-xs uppercase text-gray-500 mb-2">Bill To</h3>
            <p className="font-semibold text-gray-900">{customer?.name}</p>
            <p className="text-sm text-gray-600">{customer?.address}</p>
            <p className="text-sm text-gray-600">{customer?.email}</p>
            <p className="text-sm text-gray-600">{customer?.phone}</p>
          </div>
          <div className="text-right">
            <h3 className="text-xs uppercase text-gray-500 mb-2">Invoice Details</h3>
            <p className="text-sm text-gray-600">
              <strong>Date:</strong> {new Date(invoice.invoiceDate).toLocaleDateString()}
            </p>
            <p className="text-sm text-gray-600">
              <strong>Due:</strong> {new Date(invoice.dueDate).toLocaleDateString()}
            </p>
          </div>
        </div>

        {/* Line Items */}
        <table className="w-full mb-8">
          <thead>
            <tr className="border-b-2 border-gray-900">
              <th className="text-left py-3 text-xs uppercase text-gray-500">Description</th>
              <th className="text-center py-3 text-xs uppercase text-gray-500 w-24">Qty</th>
              <th className="text-right py-3 text-xs uppercase text-gray-500 w-32">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.laborTotalCents > 0 && (
              <tr className="border-b border-gray-200">
                <td className="py-3 text-gray-900">
                  Labor - {job?.workPerformed || job?.problemDescription || "Service"}
                </td>
                <td className="py-3 text-center text-gray-600">{job?.laborHours || 0} hrs</td>
                <td className="py-3 text-right text-gray-900">
                  ${centsToDollars(invoice.laborTotalCents)}
                </td>
              </tr>
            )}
            {job?.parts.map((part) => (
              <tr key={part.id} className="border-b border-gray-200">
                <td className="py-3 text-gray-900">{part.name}</td>
                <td className="py-3 text-center text-gray-600">{part.quantity}</td>
                <td className="py-3 text-right text-gray-900">
                  ${centsToDollars(part.quantity * part.unitPriceCents)}
                </td>
              </tr>
            ))}
            {invoice.miscFeesCents > 0 && (
              <tr className="border-b border-gray-200">
                <td className="py-3 text-gray-900">
                  {job?.miscFeesDescription || "Miscellaneous Fees"}
                </td>
                <td className="py-3 text-center text-gray-600">1</td>
                <td className="py-3 text-right text-gray-900">
                  ${centsToDollars(invoice.miscFeesCents)}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Totals */}
        <div className="ml-auto w-64">
          <div className="flex justify-between py-2 text-gray-600">
            <span>Subtotal</span>
            <span>${centsToDollars(invoice.subtotalCents)}</span>
          </div>
          <div className="flex justify-between py-2 text-gray-600">
            <span>Tax</span>
            <span>${centsToDollars(invoice.taxCents)}</span>
          </div>
          <div className="flex justify-between py-3 text-xl font-bold border-t-2 border-gray-900 text-gray-900">
            <span>Total</span>
            <span>${centsToDollars(invoice.totalCents)}</span>
          </div>
          {invoice.paidAmountCents > 0 && (
            <div className="flex justify-between py-2 text-green-600">
              <span>Paid</span>
              <span>${centsToDollars(invoice.paidAmountCents)}</span>
            </div>
          )}
          {invoice.paymentStatus !== "paid" && (
            <div className="flex justify-between py-2 text-red-600 font-bold">
              <span>Balance Due</span>
              <span>${centsToDollars(invoice.totalCents - invoice.paidAmountCents)}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-gray-200 text-center text-sm text-gray-500">
          <p>Thank you for your business!</p>
          <p className="mt-1">{settings?.companyName || "Tech & Electrical Services"}</p>
        </div>
      </div>

      {invoice && (
        <PaymentDialog
          open={isPaymentDialogOpen}
          onOpenChange={setIsPaymentDialogOpen}
          invoice={invoice}
        />
      )}
    </AppLayout>
  );
}
