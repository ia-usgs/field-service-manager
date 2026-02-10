import { v4 as uuidv4 } from 'uuid';
import { Customer, Job, Invoice, Payment, AuditLog } from '@/types';
import { getDB } from '@/lib/db';

interface PayPalRow {
  date: string;
  time: string;
  timeZone: string;
  name: string;
  type: string;
  status: string;
  currency: string;
  amount: string;
  fees: string;
  total: string;
  exchangeRate: string;
  receiptId: string;
  balance: string;
  transactionId: string;
  itemTitle: string;
}

function parsePayPalCSV(csvText: string): PayPalRow[] {
  // Remove BOM if present
  const text = csvText.replace(/^\uFEFF/, '');
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  const rows: PayPalRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    // Parse CSV respecting quoted fields
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const char of lines[i]) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        fields.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    fields.push(current.trim());

    if (fields.length >= 15) {
      rows.push({
        date: fields[0],
        time: fields[1],
        timeZone: fields[2],
        name: fields[3],
        type: fields[4],
        status: fields[5],
        currency: fields[6],
        amount: fields[7],
        fees: fields[8],
        total: fields[9],
        exchangeRate: fields[10],
        receiptId: fields[11],
        balance: fields[12],
        transactionId: fields[13],
        itemTitle: fields[14],
      });
    }
  }
  return rows;
}

function parseMMDDYYYY(dateStr: string): string {
  const [month, day, year] = dateStr.split('/');
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

export interface PayPalImportResult {
  customersCreated: number;
  customersMatched: number;
  jobsCreated: number;
  paymentsRecorded: number;
  totalAmountCents: number;
  skipped: number;
}

export async function importPayPalCSV(
  csvText: string,
  existingCustomers: Customer[],
  settings: { invoicePrefix: string; nextInvoiceNumber: number; defaultTaxRate: number; defaultLaborRateCents: number },
): Promise<{
  result: PayPalImportResult;
  newCustomers: Customer[];
  newJobs: Job[];
  newInvoices: Invoice[];
  newPayments: Payment[];
  auditLogs: AuditLog[];
  nextInvoiceNumber: number;
}> {
  const rows = parsePayPalCSV(csvText);

  // Filter only completed incoming payments (positive amount, has a name)
  const paymentRows = rows.filter(
    r => r.status === 'Completed' && r.name && parseFloat(r.amount) > 0
  );

  if (paymentRows.length === 0) {
    throw new Error('No completed payment transactions found in this CSV.');
  }

  const db = await getDB();
  const now = new Date().toISOString();
  let invoiceNum = settings.nextInvoiceNumber;

  // Build name->customer map from existing
  const customersByName = new Map<string, Customer>();
  for (const c of existingCustomers) {
    customersByName.set(c.name.toLowerCase(), c);
  }

  const newCustomers: Customer[] = [];
  const newJobs: Job[] = [];
  const newInvoices: Invoice[] = [];
  const newPayments: Payment[] = [];
  const auditLogs: AuditLog[] = [];
  let customersCreated = 0;
  let customersMatched = 0;
  let skipped = 0;

  // Check for duplicate transactions
  const existingTxIds = new Set<string>();
  const allJobs = await db.getAll('jobs');
  for (const j of allJobs) {
    if (j.technicianNotes?.includes('PayPal TX:')) {
      const match = j.technicianNotes.match(/PayPal TX: (\S+)/);
      if (match) existingTxIds.add(match[1]);
    }
  }

  for (const row of paymentRows) {
    // Skip if transaction already imported
    if (existingTxIds.has(row.transactionId)) {
      skipped++;
      continue;
    }

    // Find or create customer
    let customer = customersByName.get(row.name.toLowerCase());
    if (!customer) {
      customer = {
        id: uuidv4(),
        name: row.name,
        email: '',
        phone: '',
        address: '',
        notes: 'Imported from PayPal CSV',
        tags: ['paypal'],
        createdAt: now,
        updatedAt: now,
        archived: false,
      };
      customersByName.set(row.name.toLowerCase(), customer);
      newCustomers.push(customer);
      customersCreated++;

      auditLogs.push({
        id: uuidv4(),
        entityType: 'customer',
        entityId: customer.id,
        action: 'created',
        details: `Customer "${customer.name}" created via PayPal CSV import`,
        timestamp: now,
      });
    } else {
      customersMatched++;
    }

    const amountCents = Math.round(parseFloat(row.amount) * 100);
    const dateISO = parseMMDDYYYY(row.date);
    const description = row.itemTitle || 'PayPal payment';
    const invoiceNumber = `${settings.invoicePrefix}${invoiceNum}`;
    invoiceNum++;

    // Create job (already paid)
    const jobId = uuidv4();
    const invoiceId = uuidv4();
    const paymentId = uuidv4();

    const job: Job = {
      id: jobId,
      customerId: customer.id,
      dateOfService: dateISO,
      problemDescription: description,
      workPerformed: description,
      laborHours: 0,
      laborRateCents: settings.defaultLaborRateCents,
      parts: [],
      miscFeesCents: amountCents, // Record full amount as misc fee (flat payment)
      miscFeesDescription: `PayPal payment - ${row.transactionId}`,
      taxRate: 0, // PayPal payments are flat amounts, no tax calc
      status: 'paid',
      technicianNotes: `PayPal TX: ${row.transactionId}`,
      createdAt: now,
      updatedAt: now,
      invoiceId,
    };

    const invoice: Invoice = {
      id: invoiceId,
      invoiceNumber,
      jobId,
      customerId: customer.id,
      invoiceDate: `${dateISO}T${row.time}`,
      dueDate: `${dateISO}T${row.time}`,
      laborTotalCents: 0,
      partsTotalCents: 0,
      passThroughPartsCents: 0,
      miscFeesCents: amountCents,
      subtotalCents: amountCents,
      taxCents: 0,
      totalCents: amountCents,
      incomeAmountCents: amountCents,
      paidAmountCents: amountCents,
      paymentStatus: 'paid',
      paymentMethod: 'PayPal',
      paymentDate: `${dateISO}T${row.time}`,
      payments: [],
      createdAt: now,
      updatedAt: now,
    };

    const payment: Payment = {
      id: paymentId,
      invoiceId,
      amountCents,
      type: 'payment',
      method: 'PayPal',
      notes: `PayPal TX: ${row.transactionId}`,
      date: `${dateISO}T${row.time}`,
      createdAt: now,
    };

    // Link payment to invoice
    invoice.payments = [payment];

    newJobs.push(job);
    newInvoices.push(invoice);
    newPayments.push(payment);

    // Audit logs
    auditLogs.push(
      {
        id: uuidv4(),
        entityType: 'job',
        entityId: jobId,
        action: 'created',
        details: `Job created via PayPal CSV import - Customer: ${customer.name}, Amount: $${(amountCents / 100).toFixed(2)}, TX: ${row.transactionId}`,
        timestamp: now,
      },
      {
        id: uuidv4(),
        entityType: 'invoice',
        entityId: invoiceId,
        action: 'created',
        details: `Invoice ${invoiceNumber} created via PayPal CSV import - $${(amountCents / 100).toFixed(2)}`,
        timestamp: now,
      },
      {
        id: uuidv4(),
        entityType: 'payment',
        entityId: paymentId,
        action: 'paid',
        details: `Payment recorded via PayPal CSV import - $${(amountCents / 100).toFixed(2)}, Method: PayPal, TX: ${row.transactionId}`,
        timestamp: now,
      }
    );
  }

  // Persist everything to IndexedDB
  for (const c of newCustomers) await db.put('customers', c);
  for (const j of newJobs) await db.put('jobs', j);
  for (const i of newInvoices) await db.put('invoices', i);
  for (const p of newPayments) await db.put('payments', p);
  for (const a of auditLogs) await db.put('auditLog', a);

  // Update next invoice number in settings
  const currentSettings = await db.get('settings', 'default');
  if (currentSettings) {
    await db.put('settings', { ...currentSettings, nextInvoiceNumber: invoiceNum });
  }

  return {
    result: {
      customersCreated,
      customersMatched,
      jobsCreated: newJobs.length,
      paymentsRecorded: newPayments.length,
      totalAmountCents: newPayments.reduce((s, p) => s + p.amountCents, 0),
      skipped,
    },
    newCustomers,
    newJobs,
    newInvoices,
    newPayments,
    auditLogs,
    nextInvoiceNumber: invoiceNum,
  };
}
