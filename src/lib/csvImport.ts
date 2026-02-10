import { v4 as uuidv4 } from 'uuid';
import { Customer, Job, Invoice, Payment, Expense, AuditLog } from '@/types';
import { getDB } from '@/lib/db';

// ─── CSV Detection ───────────────────────────────────────────────────

export type CSVType = 'paypal' | 'ebay';

export function detectCSVType(csvText: string): CSVType {
  const text = csvText.replace(/^\uFEFF/, '');
  if (text.includes('Transaction report') || text.includes('Transaction creation date,Type,Order number')) {
    return 'ebay';
  }
  // PayPal has headers: "Date","Time","TimeZone","Name","Type","Status"
  if (text.includes('"Date","Time","TimeZone","Name"')) {
    return 'paypal';
  }
  throw new Error('Unrecognized CSV format. Expected PayPal or eBay transaction export.');
}

// ─── Shared Types ────────────────────────────────────────────────────

export interface ImportResult {
  source: CSVType;
  customersCreated: number;
  customersMatched: number;
  jobsCreated: number;
  paymentsRecorded: number;
  expensesCreated: number;
  totalRevenueCents: number;
  totalFeesCents: number;
  skipped: number;
}

interface ImportSettings {
  invoicePrefix: string;
  nextInvoiceNumber: number;
  defaultTaxRate: number;
  defaultLaborRateCents: number;
}

// ─── Shared CSV Parser ───────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (const char of line) {
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
  return fields;
}

// ─── Main Import Function ────────────────────────────────────────────

export async function importCSV(
  csvText: string,
  existingCustomers: Customer[],
  settings: ImportSettings,
): Promise<{ result: ImportResult }> {
  const type = detectCSVType(csvText);
  if (type === 'paypal') {
    return importPayPal(csvText, existingCustomers, settings);
  } else {
    return importEbay(csvText, existingCustomers, settings);
  }
}

// ─── Customer Lookup/Create Helper ───────────────────────────────────

class CustomerResolver {
  private byName = new Map<string, Customer>();
  newCustomers: Customer[] = [];
  auditLogs: AuditLog[] = [];
  created = 0;
  matched = 0;

  constructor(existing: Customer[], private now: string) {
    for (const c of existing) {
      this.byName.set(c.name.toLowerCase(), c);
    }
  }

  resolve(name: string, address: string, tags: string[], source: string): Customer {
    let customer = this.byName.get(name.toLowerCase());
    if (customer) {
      this.matched++;
      return customer;
    }
    customer = {
      id: uuidv4(),
      name,
      email: '',
      phone: '',
      address,
      notes: `Imported from ${source} CSV`,
      tags,
      createdAt: this.now,
      updatedAt: this.now,
      archived: false,
    };
    this.byName.set(name.toLowerCase(), customer);
    this.newCustomers.push(customer);
    this.created++;
    this.auditLogs.push({
      id: uuidv4(),
      entityType: 'customer',
      entityId: customer.id,
      action: 'created',
      details: `Customer "${name}" created via ${source} CSV import`,
      timestamp: this.now,
    });
    return customer;
  }
}

// ─── PayPal Import ───────────────────────────────────────────────────

interface PayPalRow {
  date: string; time: string; name: string; type: string; status: string;
  amount: string; fees: string; transactionId: string; itemTitle: string;
}

function parsePayPalRows(csvText: string): PayPalRow[] {
  const text = csvText.replace(/^\uFEFF/, '');
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const rows: PayPalRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const f = parseCSVLine(lines[i]);
    if (f.length >= 15) {
      rows.push({
        date: f[0], time: f[1], name: f[3], type: f[4], status: f[5],
        amount: f[7], fees: f[8], transactionId: f[13], itemTitle: f[14],
      });
    }
  }
  return rows;
}

function parseMMDDYYYY(dateStr: string): string {
  const [month, day, year] = dateStr.split('/');
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

async function importPayPal(
  csvText: string, existingCustomers: Customer[], settings: ImportSettings,
): Promise<{ result: ImportResult }> {
  const rows = parsePayPalRows(csvText);
  const paymentRows = rows.filter(r => r.status === 'Completed' && r.name && parseFloat(r.amount) > 0);
  if (paymentRows.length === 0) throw new Error('No completed payment transactions found in this CSV.');

  const db = await getDB();
  const now = new Date().toISOString();
  let invoiceNum = settings.nextInvoiceNumber;
  const resolver = new CustomerResolver(existingCustomers, now);

  const newJobs: Job[] = [];
  const newInvoices: Invoice[] = [];
  const newPayments: Payment[] = [];
  const newExpenses: Expense[] = [];
  const auditLogs: AuditLog[] = [];
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
  // Also check expenses for duplicate fee entries
  const existingExpenseTxIds = new Set<string>();
  const allExpenses = await db.getAll('expenses');
  for (const e of allExpenses) {
    if (e.notes?.includes('PayPal TX:')) {
      const match = e.notes.match(/PayPal TX: (\S+)/);
      if (match) existingExpenseTxIds.add(match[1]);
    }
  }

  for (const row of paymentRows) {
    if (existingTxIds.has(row.transactionId)) { skipped++; continue; }

    const customer = resolver.resolve(row.name, '', ['paypal'], 'PayPal');
    const amountCents = Math.round(parseFloat(row.amount) * 100);
    const feeCents = Math.abs(Math.round(parseFloat(row.fees) * 100));
    const dateISO = parseMMDDYYYY(row.date);
    const description = row.itemTitle || 'PayPal payment';
    const invoiceNumber = `${settings.invoicePrefix}${invoiceNum}`;
    invoiceNum++;

    const jobId = uuidv4();
    const invoiceId = uuidv4();
    const paymentId = uuidv4();

    newJobs.push({
      id: jobId, customerId: customer.id, dateOfService: dateISO,
      problemDescription: description, workPerformed: description,
      laborHours: 0, laborRateCents: settings.defaultLaborRateCents,
      parts: [], miscFeesCents: amountCents,
      miscFeesDescription: `PayPal payment - ${row.transactionId}`,
      taxRate: 0, status: 'paid',
      technicianNotes: `PayPal TX: ${row.transactionId}`,
      createdAt: now, updatedAt: now, invoiceId,
    });

    const invoice: Invoice = {
      id: invoiceId, invoiceNumber, jobId, customerId: customer.id,
      invoiceDate: `${dateISO}T${row.time}`, dueDate: `${dateISO}T${row.time}`,
      laborTotalCents: 0, partsTotalCents: 0, passThroughPartsCents: 0,
      miscFeesCents: amountCents, subtotalCents: amountCents, taxCents: 0,
      totalCents: amountCents, incomeAmountCents: amountCents,
      paidAmountCents: amountCents, paymentStatus: 'paid',
      paymentMethod: 'PayPal', paymentDate: `${dateISO}T${row.time}`,
      payments: [], createdAt: now, updatedAt: now,
    };

    const payment: Payment = {
      id: paymentId, invoiceId, amountCents, type: 'payment',
      method: 'PayPal', notes: `PayPal TX: ${row.transactionId}`,
      date: `${dateISO}T${row.time}`, createdAt: now,
    };
    invoice.payments = [payment];

    newPayments.push(payment);
    newInvoices.push(invoice);

    // Record PayPal fee as expense if > 0
    if (feeCents > 0 && !existingExpenseTxIds.has(row.transactionId)) {
      const expenseId = uuidv4();
      newExpenses.push({
        id: expenseId, date: dateISO, vendor: 'PayPal',
        category: 'misc', description: `PayPal transaction fee`,
        amountCents: feeCents, jobId, customerId: customer.id,
        notes: `PayPal TX: ${row.transactionId}`,
        createdAt: now, updatedAt: now,
      });
      auditLogs.push({
        id: uuidv4(), entityType: 'expense' as any, entityId: expenseId,
        action: 'created',
        details: `PayPal fee $${(feeCents / 100).toFixed(2)} recorded as expense - TX: ${row.transactionId}`,
        timestamp: now,
      });
    }

    auditLogs.push(
      { id: uuidv4(), entityType: 'job', entityId: jobId, action: 'created',
        details: `Job created via PayPal CSV import - Customer: ${customer.name}, Amount: $${(amountCents / 100).toFixed(2)}, TX: ${row.transactionId}`, timestamp: now },
      { id: uuidv4(), entityType: 'invoice', entityId: invoiceId, action: 'created',
        details: `Invoice ${invoiceNumber} created via PayPal CSV import - $${(amountCents / 100).toFixed(2)}`, timestamp: now },
      { id: uuidv4(), entityType: 'payment', entityId: paymentId, action: 'paid',
        details: `Payment recorded via PayPal CSV import - $${(amountCents / 100).toFixed(2)}, Method: PayPal, TX: ${row.transactionId}`, timestamp: now },
    );
  }

  // Persist
  const allAuditLogs = [...resolver.auditLogs, ...auditLogs];
  await persistAll(db, resolver.newCustomers, newJobs, newInvoices, newPayments, newExpenses, allAuditLogs, invoiceNum);

  return {
    result: {
      source: 'paypal',
      customersCreated: resolver.created,
      customersMatched: resolver.matched,
      jobsCreated: newJobs.length,
      paymentsRecorded: newPayments.length,
      expensesCreated: newExpenses.length,
      totalRevenueCents: newPayments.reduce((s, p) => s + p.amountCents, 0),
      totalFeesCents: newExpenses.reduce((s, e) => s + e.amountCents, 0),
      skipped,
    },
  };
}

// ─── eBay Import ─────────────────────────────────────────────────────

interface EbayRow {
  date: string; type: string; orderNumber: string; buyerUsername: string;
  buyerName: string; city: string; state: string; zip: string; country: string;
  netAmount: string; itemId: string; transactionId: string; itemTitle: string;
  quantity: string; itemSubtotal: string; shipping: string;
  fvfFixed: string; fvfVariable: string; regulatoryFee: string;
  inadFee: string; belowStandardFee: string; internationalFee: string;
  grossAmount: string; description: string;
}

function parseEbayDate(dateStr: string): string {
  // "Feb 9, 2026" → "2026-02-09"
  const months: Record<string, string> = {
    Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
    Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
  };
  const parts = dateStr.replace(',', '').split(/\s+/);
  if (parts.length < 3) return dateStr;
  const month = months[parts[0]] || '01';
  const day = parts[1].padStart(2, '0');
  const year = parts[2];
  return `${year}-${month}-${day}`;
}

function parseEbayRows(csvText: string): EbayRow[] {
  const text = csvText.replace(/^\uFEFF/, '');
  const lines = text.split('\n');

  // Find the header line
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('Transaction creation date,Type,Order number')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return [];

  const rows: EbayRow[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const f = parseCSVLine(line);
    if (f.length < 38) continue;

    rows.push({
      date: f[0], type: f[1], orderNumber: f[2], buyerUsername: f[4],
      buyerName: f[5], city: f[6], state: f[7], zip: f[8], country: f[9],
      netAmount: f[10], itemId: f[17], transactionId: f[18], itemTitle: f[19],
      quantity: f[21], itemSubtotal: f[22], shipping: f[23],
      fvfFixed: f[26], fvfVariable: f[27], regulatoryFee: f[28],
      inadFee: f[29], belowStandardFee: f[30], internationalFee: f[31],
      grossAmount: f[34], description: f[37],
    });
  }
  return rows;
}

function parseDollars(val: string): number {
  const cleaned = val.replace(/[^0-9.\-]/g, '');
  return cleaned ? parseFloat(cleaned) : 0;
}

async function importEbay(
  csvText: string, existingCustomers: Customer[], settings: ImportSettings,
): Promise<{ result: ImportResult }> {
  const rows = parseEbayRows(csvText);
  const db = await getDB();
  const now = new Date().toISOString();
  let invoiceNum = settings.nextInvoiceNumber;
  const resolver = new CustomerResolver(existingCustomers, now);

  const newJobs: Job[] = [];
  const newInvoices: Invoice[] = [];
  const newPayments: Payment[] = [];
  const newExpenses: Expense[] = [];
  const auditLogs: AuditLog[] = [];
  let skipped = 0;

  // Check for duplicate orders
  const existingOrderIds = new Set<string>();
  const allJobs = await db.getAll('jobs');
  for (const j of allJobs) {
    if (j.technicianNotes?.includes('eBay Order:')) {
      const match = j.technicianNotes.match(/eBay Order: (\S+)/);
      if (match) existingOrderIds.add(match[1]);
    }
  }
  // Dedupe fees
  const existingFeeIds = new Set<string>();
  const allExpenses = await db.getAll('expenses');
  for (const e of allExpenses) {
    if (e.notes?.includes('eBay Fee:')) {
      const match = e.notes.match(/eBay Fee: (\S+)/);
      if (match) existingFeeIds.add(match[1]);
    }
  }

  // Process Order rows - each creates a customer + job + invoice + payment
  const orderRows = rows.filter(r => r.type === 'Order' && r.buyerName && r.buyerName !== '--');

  // Group orders by order number (multi-item orders)
  const orderGroups = new Map<string, EbayRow[]>();
  for (const row of orderRows) {
    const key = row.orderNumber;
    if (!orderGroups.has(key)) orderGroups.set(key, []);
    orderGroups.get(key)!.push(row);
  }

  for (const [orderNumber, items] of orderGroups) {
    if (existingOrderIds.has(orderNumber)) { skipped++; continue; }

    const first = items[0];
    const buyerName = first.buyerName;
    const address = [first.city, first.state, first.zip, first.country].filter(s => s && s !== '--').join(', ');
    const customer = resolver.resolve(buyerName, address, ['ebay'], 'eBay');

    const dateISO = parseEbayDate(first.date);
    const invoiceNumber = `${settings.invoicePrefix}${invoiceNum}`;
    invoiceNum++;
    const jobId = uuidv4();
    const invoiceId = uuidv4();
    const paymentId = uuidv4();

    // Build parts from line items (inventory-style)
    const parts: { id: string; name: string; quantity: number; unitCostCents: number; unitPriceCents: number; source: 'inventory' | 'customer-provided' }[] = items
      .filter(item => item.itemTitle && item.itemTitle !== '--')
      .map(item => ({
        id: uuidv4(),
        name: item.itemTitle,
        quantity: parseInt(item.quantity) || 1,
        unitCostCents: 0, // cost unknown from eBay CSV
        unitPriceCents: Math.round(parseDollars(item.itemSubtotal) * 100),
        source: 'inventory' as const,
      }));

    // Calculate totals from the row that has netAmount (the summary row)
    const summaryRow = items.find(i => i.netAmount && i.netAmount !== '--') || first;
    const grossCents = Math.abs(Math.round(parseDollars(summaryRow.grossAmount) * 100));
    const itemSubtotalCents = parts.reduce((s, p) => s + p.quantity * p.unitPriceCents, 0);
    const shippingCents = Math.round(parseDollars(summaryRow.shipping) * 100);

    // Add shipping as a customer-provided pass-through part (buyer pays, not our income/expense)
    if (shippingCents > 0) {
      parts.push({
        id: uuidv4(),
        name: 'Shipping & handling',
        quantity: 1,
        unitCostCents: shippingCents,
        unitPriceCents: shippingCents,
        source: 'customer-provided' as const,
      });
    }

    // eBay fees (from the order row itself - FVF fees)
    const fvfFixed = Math.abs(Math.round(parseDollars(summaryRow.fvfFixed) * 100));
    const fvfVariable = Math.abs(Math.round(parseDollars(summaryRow.fvfVariable) * 100));
    const regulatoryFee = Math.abs(Math.round(parseDollars(summaryRow.regulatoryFee) * 100));
    const intlFee = Math.abs(Math.round(parseDollars(summaryRow.internationalFee) * 100));
    const orderFees = fvfFixed + fvfVariable + regulatoryFee + intlFee;

    const totalCents = grossCents || (itemSubtotalCents + shippingCents);

    const job: Job = {
      id: jobId, customerId: customer.id, dateOfService: dateISO,
      problemDescription: items.map(i => i.itemTitle).filter(t => t && t !== '--').join(', ') || 'eBay sale',
      workPerformed: 'eBay sale',
      laborHours: 0, laborRateCents: settings.defaultLaborRateCents,
      parts,
      miscFeesCents: 0,
      miscFeesDescription: '',
      taxRate: 0, status: 'paid',
      technicianNotes: `eBay Order: ${orderNumber}`,
      createdAt: now, updatedAt: now, invoiceId,
    };

    const inventoryParts = parts.filter(p => p.source === 'inventory');
    const passThroughParts = parts.filter(p => p.source === 'customer-provided');
    const partsTotalCents = inventoryParts.reduce((s, p) => s + p.quantity * p.unitPriceCents, 0);
    const passThroughPartsCents = passThroughParts.reduce((s, p) => s + p.quantity * p.unitPriceCents, 0);

    const invoice: Invoice = {
      id: invoiceId, invoiceNumber, jobId, customerId: customer.id,
      invoiceDate: dateISO, dueDate: dateISO,
      laborTotalCents: 0, partsTotalCents, passThroughPartsCents,
      miscFeesCents: 0, subtotalCents: partsTotalCents + passThroughPartsCents,
      taxCents: 0, totalCents,
      incomeAmountCents: partsTotalCents, // Only inventory parts count as income
      paidAmountCents: totalCents, paymentStatus: 'paid',
      paymentMethod: 'eBay', paymentDate: dateISO,
      payments: [], createdAt: now, updatedAt: now,
    };

    const payment: Payment = {
      id: paymentId, invoiceId, amountCents: totalCents, type: 'payment',
      method: 'eBay', notes: `eBay Order: ${orderNumber}`,
      date: dateISO, createdAt: now,
    };
    invoice.payments = [payment];

    newJobs.push(job);
    newInvoices.push(invoice);
    newPayments.push(payment);

    // Record order-level fees as expense
    if (orderFees > 0) {
      const expId = uuidv4();
      newExpenses.push({
        id: expId, date: dateISO, vendor: 'eBay',
        category: 'misc', description: `eBay selling fees (FVF + regulatory)`,
        amountCents: orderFees, jobId, customerId: customer.id,
        notes: `eBay Fee: ORDER-${orderNumber}`,
        createdAt: now, updatedAt: now,
      });
      auditLogs.push({
        id: uuidv4(), entityType: 'expense' as any, entityId: expId, action: 'created',
        details: `eBay selling fees $${(orderFees / 100).toFixed(2)} recorded - Order: ${orderNumber}`,
        timestamp: now,
      });
    }

    auditLogs.push(
      { id: uuidv4(), entityType: 'job', entityId: jobId, action: 'created',
        details: `Job created via eBay CSV import - Customer: ${buyerName}, Gross: $${(totalCents / 100).toFixed(2)}, Order: ${orderNumber}`, timestamp: now },
      { id: uuidv4(), entityType: 'invoice', entityId: invoiceId, action: 'created',
        details: `Invoice ${invoiceNumber} created via eBay CSV import - $${(totalCents / 100).toFixed(2)}`, timestamp: now },
      { id: uuidv4(), entityType: 'payment', entityId: paymentId, action: 'paid',
        details: `Payment recorded via eBay CSV import - $${(totalCents / 100).toFixed(2)}, Method: eBay`, timestamp: now },
    );
  }

  // Process "Other fee" rows (Promoted Listings, etc.) as expenses
  const feeRows = rows.filter(r => r.type === 'Other fee' && r.description && r.description !== '--');
  for (const row of feeRows) {
    const feeRefId = row.description.split(',')[0] || row.transactionId || row.orderNumber;
    const feeKey = `FEE-${feeRefId}`;
    if (existingFeeIds.has(feeKey)) continue;

    const feeCents = Math.abs(Math.round(parseDollars(row.grossAmount) * 100));
    if (feeCents === 0) continue;

    const dateISO = parseEbayDate(row.date);
    const expId = uuidv4();
    const feeDescription = row.description.replace(/\s+$/, '') || 'eBay fee';

    newExpenses.push({
      id: expId, date: dateISO, vendor: 'eBay',
      category: 'misc', description: feeDescription,
      amountCents: feeCents,
      notes: `eBay Fee: ${feeKey}`,
      createdAt: now, updatedAt: now,
    });
    auditLogs.push({
      id: uuidv4(), entityType: 'expense' as any, entityId: expId, action: 'created',
      details: `eBay fee $${(feeCents / 100).toFixed(2)} - ${feeDescription}`,
      timestamp: now,
    });
  }

  // Shipping labels are pass-through (customer-paid) — not recorded as expenses

  // Persist
  const allAuditLogs = [...resolver.auditLogs, ...auditLogs];
  await persistAll(db, resolver.newCustomers, newJobs, newInvoices, newPayments, newExpenses, allAuditLogs, invoiceNum);

  return {
    result: {
      source: 'ebay',
      customersCreated: resolver.created,
      customersMatched: resolver.matched,
      jobsCreated: newJobs.length,
      paymentsRecorded: newPayments.length,
      expensesCreated: newExpenses.length,
      totalRevenueCents: newPayments.reduce((s, p) => s + p.amountCents, 0),
      totalFeesCents: newExpenses.reduce((s, e) => s + e.amountCents, 0),
      skipped,
    },
  };
}

// ─── Persistence ─────────────────────────────────────────────────────

async function persistAll(
  db: Awaited<ReturnType<typeof getDB>>,
  customers: Customer[], jobs: Job[], invoices: Invoice[],
  payments: Payment[], expenses: Expense[], auditLogs: AuditLog[],
  nextInvoiceNumber: number,
) {
  for (const c of customers) await db.put('customers', c);
  for (const j of jobs) await db.put('jobs', j);
  for (const i of invoices) await db.put('invoices', i);
  for (const p of payments) await db.put('payments', p);
  for (const e of expenses) await db.put('expenses', e);
  for (const a of auditLogs) await db.put('auditLog', a);

  const currentSettings = await db.get('settings', 'default');
  if (currentSettings) {
    await db.put('settings', { ...currentSettings, nextInvoiceNumber });
  }
}
