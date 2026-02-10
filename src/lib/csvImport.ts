import { v4 as uuidv4 } from 'uuid';
import { Customer, Job, Invoice, Payment, Expense, AuditLog, InventoryItem } from '@/types';
import { getDB } from '@/lib/db';

// ─── Product-to-Components Mapping ──────────────────────────────────
// Maps eBay product titles to their bill-of-materials (component parts with costs).
// During import, matching items are expanded into individual component parts
// so that profit = sale price − sum of component costs.

interface ComponentDef {
  name: string;
  unitCostCents: number;
  category: string;
}

interface ProductMapping {
  keywords: string[];  // lowercase keywords to match against item title
  components: ComponentDef[];
}

const PRODUCT_COMPONENTS: ProductMapping[] = [
  {
    keywords: ['xeno', 'wifi companion'],
    components: [
      { name: 'Raspberry Pi 3B', unitCostCents: 5800, category: 'Electronics' },
      { name: 'E-Ink Display', unitCostCents: 4000, category: 'Displays' },
      { name: 'Micro SD Card', unitCostCents: 1000, category: 'Storage' },
    ],
  },
  {
    keywords: ['bjorn'],
    components: [
      { name: 'Raspberry Pi Zero W', unitCostCents: 3000, category: 'Electronics' },
      { name: 'E-Ink Display', unitCostCents: 4000, category: 'Displays' },
      { name: 'Micro SD Card', unitCostCents: 1000, category: 'Storage' },
    ],
  },
  {
    keywords: ['netgotchi'],
    components: [
      { name: 'ESP32', unitCostCents: 600, category: 'Electronics' },
      { name: '1.3 Inch IIC I2C OLED Display Module 128x64 SH1106', unitCostCents: 400, category: 'Displays' },
    ],
  },
];

// ─── CSV Detection ───────────────────────────────────────────────────

export type CSVType = 'paypal' | 'ebay';

export function detectCSVType(csvText: string): CSVType {
  const text = csvText.replace(/^\uFEFF/, '');
  // eBay Order Earnings Report
  if (text.includes('Order earnings report') || text.includes('Order creation date,Order number,Item ID')) {
    return 'ebay';
  }
  // Legacy eBay Transaction Report (keep for backward compat)
  if (text.includes('Transaction report') || text.includes('Transaction creation date,Type,Order number')) {
    return 'ebay';
  }
  // PayPal has headers: "Date","Time","TimeZone","Name","Type","Status"
  if (text.includes('"Date","Time","TimeZone","Name"')) {
    return 'paypal';
  }
  throw new Error('Unrecognized CSV format. Expected PayPal or eBay transaction/earnings export.');
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

// ─── eBay Import (Order Earnings Report) ─────────────────────────────

interface EbayRow {
  orderDate: string;
  orderNumber: string;
  itemId: string;
  itemTitle: string;
  buyerName: string;
  shipCity: string;
  shipState: string;
  shipZip: string;
  shipCountry: string;
  transactionCurrency: string;
  ebayCollectedTax: string;
  itemPrice: string;
  quantity: string;
  itemSubtotal: string;
  shippingAndHandling: string;
  sellerCollectedTax: string;
  discount: string;
  payoutCurrency: string;
  grossAmount: string;
  fvfFixed: string;
  fvfVariable: string;
  belowStandardFee: string;
  inadFee: string;
  internationalFee: string;
  depositProcessingFee: string;
  regulatoryFee: string;
  promotedListingFee: string;
  charityDonation: string;
  shippingLabels: string;
  paymentDisputeFee: string;
  expenses: string;
  refunds: string;
  orderEarnings: string;
  yourCost: string;
  netOrderEarnings: string;
}

function parseEbayDate(dateStr: string): string {
  // Supports "24-Feb-25" and "Feb 9, 2026"
  const months: Record<string, string> = {
    Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
    Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
  };

  // "24-Feb-25" format (day-Mon-YY)
  const dmy = dateStr.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
  if (dmy) {
    const day = dmy[1].padStart(2, '0');
    const month = months[dmy[2]] || '01';
    let year = dmy[3];
    if (year.length === 2) year = (parseInt(year) >= 50 ? '19' : '20') + year;
    return `${year}-${month}-${day}`;
  }

  // "Feb 9, 2026" format (legacy)
  const parts = dateStr.replace(',', '').split(/\s+/);
  if (parts.length >= 3) {
    const month = months[parts[0]] || '01';
    const day = parts[1].padStart(2, '0');
    const year = parts[2];
    return `${year}-${month}-${day}`;
  }

  return dateStr;
}

function parseEbayRows(csvText: string): EbayRow[] {
  const text = csvText.replace(/^\uFEFF/, '');
  const lines = text.split('\n');

  // Find the header line — works for both report formats
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('Order creation date,Order number,Item ID')) {
      headerIdx = i;
      break;
    }
    // Legacy Transaction Report format
    if (lines[i].startsWith('Transaction creation date,Type,Order number')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return [];

  const isEarningsReport = lines[headerIdx].startsWith('Order creation date');

  const rows: EbayRow[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const f = parseCSVLine(line);

    if (isEarningsReport) {
      if (f.length < 33) continue;
      rows.push({
        orderDate: f[0],
        orderNumber: f[1],
        itemId: f[2],
        itemTitle: f[3],
        buyerName: f[4],
        shipCity: f[5],
        shipState: f[6],
        shipZip: f[7],
        shipCountry: f[8],
        transactionCurrency: f[9],
        ebayCollectedTax: f[10],
        itemPrice: f[11],
        quantity: f[12],
        itemSubtotal: f[13],
        shippingAndHandling: f[14],
        sellerCollectedTax: f[15],
        discount: f[16],
        payoutCurrency: f[17],
        grossAmount: f[18],
        fvfFixed: f[19],
        fvfVariable: f[20],
        belowStandardFee: f[21],
        inadFee: f[22],
        internationalFee: f[23],
        depositProcessingFee: f[24],
        regulatoryFee: f[25],
        promotedListingFee: f[26],
        charityDonation: f[27],
        shippingLabels: f[28],
        paymentDisputeFee: f[29],
        expenses: f[30],
        refunds: f[31],
        orderEarnings: f[32],
        yourCost: f[33] || '--',
        netOrderEarnings: f[34] || '--',
      });
    } else {
      // Legacy Transaction Report — map into the same interface
      if (f.length < 38) continue;
      // Only process 'Order' type rows
      if (f[1] !== 'Order') continue;
      rows.push({
        orderDate: f[0],
        orderNumber: f[2],
        itemId: f[17],
        itemTitle: f[19],
        buyerName: f[5],
        shipCity: f[6],
        shipState: f[7],
        shipZip: f[8],
        shipCountry: f[9],
        transactionCurrency: f[35],
        ebayCollectedTax: f[25],
        itemPrice: '--',
        quantity: f[21],
        itemSubtotal: f[22],
        shippingAndHandling: f[23],
        sellerCollectedTax: f[24],
        discount: '--',
        payoutCurrency: f[11],
        grossAmount: f[34],
        fvfFixed: f[26],
        fvfVariable: f[27],
        belowStandardFee: f[30],
        inadFee: f[29],
        internationalFee: f[31],
        depositProcessingFee: f[33],
        regulatoryFee: f[28],
        promotedListingFee: '--',
        charityDonation: f[32],
        shippingLabels: '--',
        paymentDisputeFee: '--',
        expenses: '--',
        refunds: '--',
        orderEarnings: '--',
        yourCost: '--',
        netOrderEarnings: '--',
      });
    }
  }
  return rows;
}

function parseDollars(val: string): number {
  const cleaned = val.replace(/[^0-9.\-]/g, '');
  return cleaned ? parseFloat(cleaned) : 0;
}

// Build enriched technician notes from all available eBay fields
function buildEbayNotes(row: EbayRow, orderNumber: string): string {
  const lines: string[] = [`eBay Order: ${orderNumber}`];
  const add = (label: string, val: string | undefined) => {
    if (val && val !== '--' && val.trim()) lines.push(`${label}: ${val.trim()}`);
  };
  add('Item ID', row.itemId);
  add('Item Title', row.itemTitle);
  add('Buyer', row.buyerName);
  const addr = [row.shipCity, row.shipState, row.shipZip, row.shipCountry].filter(s => s && s !== '--').join(', ');
  if (addr) lines.push(`Ship To: ${addr}`);
  add('eBay Collected Tax', row.ebayCollectedTax);
  add('Seller Collected Tax', row.sellerCollectedTax);
  add('Discount', row.discount);
  add('Gross Amount', row.grossAmount);
  add('Shipping Labels', row.shippingLabels);
  add('Promoted Listing Fee', row.promotedListingFee);
  add('Payment Dispute Fee', row.paymentDisputeFee);
  add('Refunds', row.refunds);
  add('Order Earnings', row.orderEarnings);
  return lines.join('\n');
}

async function importEbay(
  csvText: string, existingCustomers: Customer[], settings: ImportSettings,
): Promise<{ result: ImportResult }> {
  const rows = parseEbayRows(csvText);
  if (rows.length === 0) throw new Error('No order rows found in this eBay CSV.');
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

  // Load existing inventory items for deduplication
  const existingInventory = await db.getAll('inventoryItems');
  const inventoryResolver = new InventoryResolver(existingInventory, now);

  for (const row of rows) {
    const orderNumber = row.orderNumber;
    if (!orderNumber || orderNumber === '--') continue;
    if (!row.buyerName || row.buyerName === '--') continue;
    if (existingOrderIds.has(orderNumber)) { skipped++; continue; }

    const address = [row.shipCity, row.shipState, row.shipZip, row.shipCountry].filter(s => s && s !== '--').join(', ');
    const customer = resolver.resolve(row.buyerName, address, ['ebay'], 'eBay');

    const dateISO = parseEbayDate(row.orderDate);
    const invoiceNumber = `${settings.invoicePrefix}${invoiceNum}`;
    invoiceNum++;
    const jobId = uuidv4();
    const invoiceId = uuidv4();
    const paymentId = uuidv4();

    // Build parts — expand known products into component parts (BOM)
    const parts: { id: string; name: string; quantity: number; unitCostCents: number; unitPriceCents: number; source: 'inventory' | 'customer-provided'; inventoryItemId?: string }[] = [];

    const itemTitle = row.itemTitle || 'eBay sale';
    const qty = parseInt(row.quantity) || 1;
    const salePriceCents = Math.round(parseDollars(row.itemSubtotal) * 100);
    const perUnitSaleCents = Math.round(salePriceCents / qty);

    if (itemTitle !== '--' && itemTitle !== 'Multi-Item') {
      const mapping = findProductMapping(itemTitle);
      if (mapping) {
        const totalComponentCost = mapping.components.reduce((s, c) => s + c.unitCostCents, 0);
        for (const comp of mapping.components) {
          const invItem = inventoryResolver.resolve(comp);
          const pricePortion = totalComponentCost > 0
            ? Math.round((comp.unitCostCents / totalComponentCost) * perUnitSaleCents)
            : Math.round(perUnitSaleCents / mapping.components.length);
          parts.push({
            id: uuidv4(), name: comp.name, quantity: qty,
            unitCostCents: comp.unitCostCents, unitPriceCents: pricePortion,
            source: 'inventory' as const, inventoryItemId: invItem.id,
          });
        }
      } else {
        parts.push({
          id: uuidv4(), name: itemTitle, quantity: qty,
          unitCostCents: 0, unitPriceCents: salePriceCents,
          source: 'inventory' as const,
        });
      }
    } else if (salePriceCents > 0) {
      // Multi-Item or unknown — record as generic sale
      parts.push({
        id: uuidv4(), name: 'eBay Multi-Item Sale', quantity: 1,
        unitCostCents: 0, unitPriceCents: salePriceCents,
        source: 'inventory' as const,
      });
    }

    // Shipping as pass-through
    const shippingCents = Math.abs(Math.round(parseDollars(row.shippingAndHandling) * 100));
    if (shippingCents > 0) {
      parts.push({
        id: uuidv4(), name: 'Shipping & handling', quantity: 1,
        unitCostCents: shippingCents, unitPriceCents: shippingCents,
        source: 'customer-provided' as const,
      });
    }

    // Calculate fees from individual columns
    const fvfFixed = Math.abs(Math.round(parseDollars(row.fvfFixed) * 100));
    const fvfVariable = Math.abs(Math.round(parseDollars(row.fvfVariable) * 100));
    const belowStdFee = Math.abs(Math.round(parseDollars(row.belowStandardFee) * 100));
    const inadFee = Math.abs(Math.round(parseDollars(row.inadFee) * 100));
    const intlFee = Math.abs(Math.round(parseDollars(row.internationalFee) * 100));
    const depositFee = Math.abs(Math.round(parseDollars(row.depositProcessingFee) * 100));
    const regulatoryFee = Math.abs(Math.round(parseDollars(row.regulatoryFee) * 100));
    const promotedListingFee = Math.abs(Math.round(parseDollars(row.promotedListingFee) * 100));
    const charityDonation = Math.abs(Math.round(parseDollars(row.charityDonation) * 100));
    const paymentDisputeFee = Math.abs(Math.round(parseDollars(row.paymentDisputeFee) * 100));
    const shippingLabelCost = Math.abs(Math.round(parseDollars(row.shippingLabels) * 100));
    const orderFees = fvfFixed + fvfVariable + belowStdFee + inadFee + intlFee + depositFee + regulatoryFee + promotedListingFee + charityDonation + paymentDisputeFee;

    const grossCents = Math.abs(Math.round(parseDollars(row.grossAmount) * 100));
    const itemSubtotalCents = parts.reduce((s, p) => s + p.quantity * p.unitPriceCents, 0);
    const totalCents = grossCents || itemSubtotalCents;

    // Handle refunds
    const refundCents = Math.abs(Math.round(parseDollars(row.refunds) * 100));
    const isRefunded = refundCents > 0 && refundCents >= totalCents;

    const job: Job = {
      id: jobId, customerId: customer.id, dateOfService: dateISO,
      problemDescription: itemTitle !== '--' ? itemTitle : 'eBay Multi-Item Sale',
      workPerformed: 'eBay sale',
      laborHours: 0, laborRateCents: settings.defaultLaborRateCents,
      parts,
      miscFeesCents: 0, miscFeesDescription: '',
      taxRate: 0, status: isRefunded ? 'completed' : 'paid',
      technicianNotes: buildEbayNotes(row, orderNumber),
      createdAt: now, updatedAt: now, invoiceId,
    };

    const inventoryParts = parts.filter(p => p.source === 'inventory');
    const passThroughParts = parts.filter(p => p.source === 'customer-provided');
    const partsTotalCents = inventoryParts.reduce((s, p) => s + p.quantity * p.unitPriceCents, 0);
    const passThroughPartsCents = passThroughParts.reduce((s, p) => s + p.quantity * p.unitPriceCents, 0);

    const paidAmount = isRefunded ? 0 : totalCents;

    const invoice: Invoice = {
      id: invoiceId, invoiceNumber, jobId, customerId: customer.id,
      invoiceDate: dateISO, dueDate: dateISO,
      laborTotalCents: 0, partsTotalCents, passThroughPartsCents,
      miscFeesCents: 0, subtotalCents: partsTotalCents + passThroughPartsCents,
      taxCents: 0, totalCents,
      incomeAmountCents: partsTotalCents,
      paidAmountCents: paidAmount,
      paymentStatus: isRefunded ? 'unpaid' : 'paid',
      paymentMethod: 'eBay', paymentDate: dateISO,
      payments: [], createdAt: now, updatedAt: now,
    };

    const payments: Payment[] = [];
    if (!isRefunded) {
      const payment: Payment = {
        id: paymentId, invoiceId, amountCents: totalCents, type: 'payment',
        method: 'eBay', notes: `eBay Order: ${orderNumber}`,
        date: dateISO, createdAt: now,
      };
      payments.push(payment);
      newPayments.push(payment);
    }
    // Record refund as a separate payment entry
    if (refundCents > 0) {
      const refundPayment: Payment = {
        id: uuidv4(), invoiceId, amountCents: refundCents, type: 'refund',
        method: 'eBay', notes: `eBay Refund - Order: ${orderNumber}`,
        date: dateISO, createdAt: now,
      };
      payments.push(refundPayment);
      newPayments.push(refundPayment);
    }
    invoice.payments = payments;

    newJobs.push(job);
    newInvoices.push(invoice);

    // Record selling fees as expense
    if (orderFees > 0 && !existingFeeIds.has(`ORDER-${orderNumber}`)) {
      const expId = uuidv4();
      const feeDetails: string[] = [];
      if (fvfFixed > 0) feeDetails.push(`FVF Fixed: $${(fvfFixed / 100).toFixed(2)}`);
      if (fvfVariable > 0) feeDetails.push(`FVF Variable: $${(fvfVariable / 100).toFixed(2)}`);
      if (promotedListingFee > 0) feeDetails.push(`Promoted Listing: $${(promotedListingFee / 100).toFixed(2)}`);
      if (intlFee > 0) feeDetails.push(`International: $${(intlFee / 100).toFixed(2)}`);
      if (regulatoryFee > 0) feeDetails.push(`Regulatory: $${(regulatoryFee / 100).toFixed(2)}`);
      if (paymentDisputeFee > 0) feeDetails.push(`Payment Dispute: $${(paymentDisputeFee / 100).toFixed(2)}`);

      newExpenses.push({
        id: expId, date: dateISO, vendor: 'eBay',
        category: 'misc', description: `eBay selling fees (${feeDetails.join(', ')})`,
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

    // Record shipping label cost as separate expense
    if (shippingLabelCost > 0 && !existingFeeIds.has(`SHIP-${orderNumber}`)) {
      const expId = uuidv4();
      newExpenses.push({
        id: expId, date: dateISO, vendor: 'eBay',
        category: 'misc', description: `eBay shipping label`,
        amountCents: shippingLabelCost, jobId, customerId: customer.id,
        notes: `eBay Fee: SHIP-${orderNumber}`,
        createdAt: now, updatedAt: now,
      });
      auditLogs.push({
        id: uuidv4(), entityType: 'expense' as any, entityId: expId, action: 'created',
        details: `eBay shipping label $${(shippingLabelCost / 100).toFixed(2)} - Order: ${orderNumber}`,
        timestamp: now,
      });
    }

    auditLogs.push(
      { id: uuidv4(), entityType: 'job', entityId: jobId, action: 'created',
        details: `Job created via eBay CSV import - Customer: ${row.buyerName}, Gross: $${(totalCents / 100).toFixed(2)}, Order: ${orderNumber}`, timestamp: now },
      { id: uuidv4(), entityType: 'invoice', entityId: invoiceId, action: 'created',
        details: `Invoice ${invoiceNumber} created via eBay CSV import - $${(totalCents / 100).toFixed(2)}`, timestamp: now },
      { id: uuidv4(), entityType: 'payment', entityId: paymentId, action: 'paid',
        details: `Payment recorded via eBay CSV import - $${(totalCents / 100).toFixed(2)}, Method: eBay`, timestamp: now },
    );
  }

  // Persist (including any new inventory items)
  const allAuditLogs = [...resolver.auditLogs, ...inventoryResolver.auditLogs, ...auditLogs];
  await persistAll(db, resolver.newCustomers, newJobs, newInvoices, newPayments, newExpenses, allAuditLogs, invoiceNum, inventoryResolver.newItems);

  return {
    result: {
      source: 'ebay',
      customersCreated: resolver.created,
      customersMatched: resolver.matched,
      jobsCreated: newJobs.length,
      paymentsRecorded: newPayments.length,
      expensesCreated: newExpenses.length,
      totalRevenueCents: newPayments.filter(p => p.type === 'payment').reduce((s, p) => s + p.amountCents, 0),
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
  inventoryItems?: InventoryItem[],
) {
  for (const c of customers) await db.put('customers', c);
  for (const j of jobs) await db.put('jobs', j);
  for (const i of invoices) await db.put('invoices', i);
  for (const p of payments) await db.put('payments', p);
  for (const e of expenses) await db.put('expenses', e);
  for (const a of auditLogs) await db.put('auditLog', a);
  if (inventoryItems) {
    for (const item of inventoryItems) await db.put('inventoryItems', item);
  }

  const currentSettings = await db.get('settings', 'default');
  if (currentSettings) {
    await db.put('settings', { ...currentSettings, nextInvoiceNumber });
  }
}

// ─── Inventory Resolution Helper ────────────────────────────────────
// Finds or creates inventory items by name, avoiding duplicates.

function findProductMapping(itemTitle: string): ProductMapping | undefined {
  const lower = itemTitle.toLowerCase();
  return PRODUCT_COMPONENTS.find(pm => pm.keywords.some(kw => lower.includes(kw)));
}

class InventoryResolver {
  private byName = new Map<string, InventoryItem>();
  newItems: InventoryItem[] = [];
  auditLogs: AuditLog[] = [];

  constructor(existing: InventoryItem[], private now: string) {
    for (const item of existing) {
      this.byName.set(item.name.toLowerCase(), item);
    }
  }

  resolve(comp: ComponentDef): InventoryItem {
    const key = comp.name.toLowerCase();
    const existing = this.byName.get(key);
    if (existing) return existing;

    const item: InventoryItem = {
      id: uuidv4(),
      name: comp.name,
      unitCostCents: comp.unitCostCents,
      unitPriceCents: comp.unitCostCents, // sell price = cost (actual sell price comes from eBay sale)
      quantity: 0, // will be managed by stock adjustments
      category: comp.category,
      createdAt: this.now,
      updatedAt: this.now,
    };
    this.byName.set(key, item);
    this.newItems.push(item);
    this.auditLogs.push({
      id: uuidv4(),
      entityType: 'inventory',
      entityId: item.id,
      action: 'created',
      details: `Inventory item "${comp.name}" auto-created via eBay import (cost: $${(comp.unitCostCents / 100).toFixed(2)})`,
      timestamp: this.now,
    });
    return item;
  }
}
