import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { Customer, Job, Invoice, Expense, AppSettings, AuditLog, Payment, Reminder, Attachment, InventoryItem } from '@/types';
import { getDB, initializeSettings } from '@/lib/db';

interface AppState {
  // Data
  customers: Customer[];
  jobs: Job[];
  invoices: Invoice[];
  expenses: Expense[];
  payments: Payment[];
  reminders: Reminder[];
  attachments: Attachment[];
  inventoryItems: InventoryItem[];
  settings: AppSettings | null;
  auditLogs: AuditLog[];
  isLoading: boolean;

  // Actions
  initialize: () => Promise<void>;

  // Customer actions
  addCustomer: (customer: Omit<Customer, 'id' | 'createdAt' | 'updatedAt' | 'archived'>) => Promise<Customer>;
  updateCustomer: (id: string, updates: Partial<Customer>) => Promise<void>;
  archiveCustomer: (id: string) => Promise<void>;
  deleteCustomer: (id: string) => Promise<void>;

  // Job actions
  addJob: (job: Omit<Job, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Job>;
  updateJob: (id: string, updates: Partial<Job>) => Promise<void>;
  deleteJob: (id: string, forceDelete?: boolean) => Promise<void>;
  completeJob: (id: string) => Promise<Invoice>;

  // Invoice actions
  updateInvoice: (id: string, updates: Partial<Invoice>) => Promise<void>;
  recalculateInvoice: (id: string) => Promise<void>;
  recordPayment: (id: string, amountCents: number, method: string, notes?: string) => Promise<void>;
  recordRefund: (invoiceId: string, amountCents: number, method: string, notes?: string) => Promise<void>;

  // Payment actions
  getPaymentsByInvoice: (invoiceId: string) => Payment[];

  // Reminder actions
  addReminder: (reminder: Omit<Reminder, 'id' | 'createdAt' | 'updatedAt' | 'completed'>) => Promise<Reminder>;
  updateReminder: (id: string, updates: Partial<Reminder>) => Promise<void>;
  completeReminder: (id: string) => Promise<void>;
  deleteReminder: (id: string) => Promise<void>;
  getRemindersByJob: (jobId: string) => Reminder[];
  getRemindersByCustomer: (customerId: string) => Reminder[];
  getUpcomingReminders: (days?: number) => Reminder[];

  // Attachment actions
  addAttachment: (attachment: Omit<Attachment, 'id' | 'createdAt'>) => Promise<Attachment>;
  deleteAttachment: (id: string) => Promise<void>;
  getAttachmentsByJob: (jobId: string) => Attachment[];

  // Inventory actions
  addInventoryItem: (item: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'>) => Promise<InventoryItem>;
  updateInventoryItem: (id: string, updates: Partial<InventoryItem>) => Promise<void>;
  deleteInventoryItem: (id: string) => Promise<void>;

  // Expense actions
  addExpense: (expense: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Expense>;
  updateExpense: (id: string, updates: Partial<Expense>) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;

  // Settings actions
  updateSettings: (updates: Partial<AppSettings>) => Promise<void>;

  // Computed values
  getCustomerById: (id: string) => Customer | undefined;
  getJobsByCustomer: (customerId: string) => Job[];
  getInvoicesByCustomer: (customerId: string) => Invoice[];
  getCustomerTotalSpend: (customerId: string) => number;
  getCustomerOutstandingBalance: (customerId: string) => number;

  // Export
  exportData: () => Promise<string>;
  importData: (jsonData: string) => Promise<void>;
}

export const useStore = create<AppState>((set, get) => ({
  customers: [],
  jobs: [],
  invoices: [],
  expenses: [],
  payments: [],
  reminders: [],
  attachments: [],
  inventoryItems: [],
  settings: null,
  auditLogs: [],
  isLoading: true,

  initialize: async () => {
    const db = await getDB();
    const settings = await initializeSettings();

    const [customers, jobs, invoices, expenses, payments, reminders, attachments, inventoryItems, auditLogs] = await Promise.all([
      db.getAll('customers'),
      db.getAll('jobs'),
      db.getAll('invoices'),
      db.getAll('expenses'),
      db.getAll('payments'),
      db.getAll('reminders'),
      db.getAll('attachments'),
      db.getAll('inventoryItems'),
      db.getAll('auditLog'),
    ]);

    set({
      customers,
      jobs,
      invoices,
      expenses,
      payments,
      reminders,
      attachments,
      inventoryItems,
      settings,
      auditLogs,
      isLoading: false,
    });
  },

  addCustomer: async (customerData) => {
    const db = await getDB();
    const now = new Date().toISOString();
    const customer: Customer = {
      ...customerData,
      id: uuidv4(),
      createdAt: now,
      updatedAt: now,
      archived: false,
    };

    await db.put('customers', customer);

    const auditLog: AuditLog = {
      id: uuidv4(),
      entityType: 'customer',
      entityId: customer.id,
      action: 'created',
      details: `Customer "${customer.name}" created`,
      timestamp: now,
    };
    await db.put('auditLog', auditLog);

    set((state) => ({
      customers: [...state.customers, customer],
      auditLogs: [...state.auditLogs, auditLog],
    }));

    return customer;
  },

  updateCustomer: async (id, updates) => {
    const db = await getDB();
    const customer = get().customers.find((c) => c.id === id);
    if (!customer) return;

    const updatedCustomer = {
      ...customer,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await db.put('customers', updatedCustomer);

    const auditLog: AuditLog = {
      id: uuidv4(),
      entityType: 'customer',
      entityId: id,
      action: 'updated',
      details: `Customer "${updatedCustomer.name}" updated`,
      timestamp: new Date().toISOString(),
    };
    await db.put('auditLog', auditLog);

    set((state) => ({
      customers: state.customers.map((c) => (c.id === id ? updatedCustomer : c)),
      auditLogs: [...state.auditLogs, auditLog],
    }));
  },

  archiveCustomer: async (id) => {
    await get().updateCustomer(id, { archived: true });
  },

  deleteCustomer: async (id) => {
    const db = await getDB();
    const customer = get().customers.find((c) => c.id === id);
    if (!customer) return;

    // Check if customer has any jobs - if so, don't allow deletion
    const hasJobs = get().jobs.some((j) => j.customerId === id);
    if (hasJobs) {
      throw new Error('Cannot delete customer with existing jobs');
    }

    await db.delete('customers', id);

    const auditLog: AuditLog = {
      id: uuidv4(),
      entityType: 'customer',
      entityId: id,
      action: 'deleted',
      details: `Customer "${customer.name}" deleted`,
      timestamp: new Date().toISOString(),
    };
    await db.put('auditLog', auditLog);

    set((state) => ({
      customers: state.customers.filter((c) => c.id !== id),
      auditLogs: [...state.auditLogs, auditLog],
    }));
  },

  addJob: async (jobData) => {
    const db = await getDB();
    const now = new Date().toISOString();
    const job: Job = {
      ...jobData,
      id: uuidv4(),
      createdAt: now,
      updatedAt: now,
    };

    await db.put('jobs', job);

    // Deduct inventory quantities for parts with inventoryItemId
    const updatedInventoryItems: InventoryItem[] = [];
    for (const part of job.parts || []) {
      if (part.inventoryItemId && part.source === 'inventory') {
        const inventoryItem = get().inventoryItems.find(i => i.id === part.inventoryItemId);
        if (inventoryItem) {
          const updatedItem = {
            ...inventoryItem,
            quantity: Math.max(0, inventoryItem.quantity - part.quantity),
            updatedAt: now,
          };
          await db.put('inventoryItems', updatedItem);
          updatedInventoryItems.push(updatedItem);
        }
      }
    }

    const auditLog: AuditLog = {
      id: uuidv4(),
      entityType: 'job',
      entityId: job.id,
      action: 'created',
      details: `Job created for customer`,
      timestamp: now,
    };
    await db.put('auditLog', auditLog);

    set((state) => ({
      jobs: [...state.jobs, job],
      inventoryItems: state.inventoryItems.map(item => {
        const updated = updatedInventoryItems.find(u => u.id === item.id);
        return updated || item;
      }),
      auditLogs: [...state.auditLogs, auditLog],
    }));

    return job;
  },

  updateJob: async (id, updates) => {
    const db = await getDB();
    const job = get().jobs.find((j) => j.id === id);
    if (!job) return;

    const now = new Date().toISOString();
    const updatedJob = {
      ...job,
      ...updates,
      updatedAt: now,
    };

    await db.put('jobs', updatedJob);

    // Handle inventory adjustments when parts change
    const updatedInventoryItems: InventoryItem[] = [];
    
    if (updates.parts) {
      const oldParts = job.parts || [];
      const newParts = updates.parts || [];
      
      // Calculate quantity changes per inventory item
      const inventoryChanges: Record<string, number> = {};
      
      // Add back quantities from old parts (restore)
      for (const part of oldParts) {
        if (part.inventoryItemId && part.source === 'inventory') {
          inventoryChanges[part.inventoryItemId] = (inventoryChanges[part.inventoryItemId] || 0) + part.quantity;
        }
      }
      
      // Subtract quantities for new parts (deduct)
      for (const part of newParts) {
        if (part.inventoryItemId && part.source === 'inventory') {
          inventoryChanges[part.inventoryItemId] = (inventoryChanges[part.inventoryItemId] || 0) - part.quantity;
        }
      }
      
      // Apply changes to inventory
      for (const [inventoryItemId, quantityChange] of Object.entries(inventoryChanges)) {
        if (quantityChange !== 0) {
          const inventoryItem = get().inventoryItems.find(i => i.id === inventoryItemId);
          if (inventoryItem) {
            const updatedItem = {
              ...inventoryItem,
              quantity: Math.max(0, inventoryItem.quantity + quantityChange),
              updatedAt: now,
            };
            await db.put('inventoryItems', updatedItem);
            updatedInventoryItems.push(updatedItem);
          }
        }
      }
    }

    set((state) => ({
      jobs: state.jobs.map((j) => (j.id === id ? updatedJob : j)),
      inventoryItems: updatedInventoryItems.length > 0 
        ? state.inventoryItems.map(item => {
            const updated = updatedInventoryItems.find(u => u.id === item.id);
            return updated || item;
          })
        : state.inventoryItems,
    }));

    // If this job has an invoice, recalculate it
    if (job.invoiceId) {
      await get().recalculateInvoice(job.invoiceId);
    }
  },

  deleteJob: async (id, forceDelete = false) => {
    const db = await getDB();
    const job = get().jobs.find((j) => j.id === id);
    if (!job) return;

    const isInvoicedOrPaid = job.status === 'invoiced' || job.status === 'paid';
    
    // Require forceDelete flag for invoiced/paid jobs
    if (isInvoicedOrPaid && !forceDelete) {
      throw new Error('Cannot delete invoiced or paid jobs without force flag');
    }

    const now = new Date().toISOString();
    const customer = get().customers.find(c => c.id === job.customerId);
    const customerName = customer?.name || 'Unknown Customer';

    // If job has an invoice, delete it too
    let deletedInvoice: Invoice | null = null;
    if (job.invoiceId) {
      const invoice = get().invoices.find(i => i.id === job.invoiceId);
      if (invoice) {
        deletedInvoice = invoice;
        
        // Delete associated payments
        const invoicePayments = get().payments.filter(p => p.invoiceId === invoice.id);
        for (const payment of invoicePayments) {
          await db.delete('payments', payment.id);
        }
        
        await db.delete('invoices', invoice.id);
        
        // Log invoice deletion
        const invoiceAuditLog: AuditLog = {
          id: uuidv4(),
          entityType: 'invoice',
          entityId: invoice.id,
          action: 'deleted',
          details: `Invoice #${invoice.invoiceNumber} deleted (job deletion) - Customer: ${customerName}, Total: $${(invoice.totalCents / 100).toFixed(2)}`,
          timestamp: now,
        };
        await db.put('auditLog', invoiceAuditLog);
      }
    }

    // Restore inventory quantities for parts that were used
    const updatedInventoryItems: InventoryItem[] = [];
    for (const part of job.parts || []) {
      if (part.inventoryItemId && part.source === 'inventory') {
        const inventoryItem = get().inventoryItems.find(i => i.id === part.inventoryItemId);
        if (inventoryItem) {
          const updatedItem = {
            ...inventoryItem,
            quantity: inventoryItem.quantity + part.quantity,
            updatedAt: now,
          };
          await db.put('inventoryItems', updatedItem);
          updatedInventoryItems.push(updatedItem);
        }
      }
    }

    // Delete associated reminders and attachments
    const jobReminders = get().reminders.filter((r) => r.jobId === id);
    const jobAttachments = get().attachments.filter((a) => a.jobId === id);
    
    for (const reminder of jobReminders) {
      await db.delete('reminders', reminder.id);
    }
    for (const attachment of jobAttachments) {
      await db.delete('attachments', attachment.id);
    }

    await db.delete('jobs', id);

    // Calculate job total for audit log
    const laborTotal = job.laborHours * job.laborRateCents;
    const partsTotal = (job.parts || []).reduce((sum, p) => sum + p.quantity * p.unitPriceCents, 0);
    const subtotal = laborTotal + partsTotal + job.miscFeesCents;
    const tax = Math.round(subtotal * (job.taxRate / 100));
    const total = subtotal + tax;

    const auditLog: AuditLog = {
      id: uuidv4(),
      entityType: 'job',
      entityId: id,
      action: 'deleted',
      details: `Job deleted - Customer: ${customerName}, Status: ${job.status}, Total: $${(total / 100).toFixed(2)}${isInvoicedOrPaid ? ' (FORCE DELETE - was ' + job.status + ')' : ''}`,
      timestamp: now,
    };
    await db.put('auditLog', auditLog);

    set((state) => ({
      jobs: state.jobs.filter((j) => j.id !== id),
      invoices: deletedInvoice ? state.invoices.filter((i) => i.id !== deletedInvoice!.id) : state.invoices,
      payments: deletedInvoice ? state.payments.filter((p) => p.invoiceId !== deletedInvoice!.id) : state.payments,
      reminders: state.reminders.filter((r) => r.jobId !== id),
      attachments: state.attachments.filter((a) => a.jobId !== id),
      inventoryItems: updatedInventoryItems.length > 0 
        ? state.inventoryItems.map(item => {
            const updated = updatedInventoryItems.find(u => u.id === item.id);
            return updated || item;
          })
        : state.inventoryItems,
      auditLogs: [...state.auditLogs, auditLog, ...(deletedInvoice ? [{
        id: uuidv4(),
        entityType: 'invoice' as const,
        entityId: deletedInvoice.id,
        action: 'deleted' as const,
        details: `Invoice #${deletedInvoice.invoiceNumber} deleted (job deletion)`,
        timestamp: now,
      }] : [])],
    }));
  },

  completeJob: async (id) => {
    const db = await getDB();
    const state = get();
    const job = state.jobs.find((j) => j.id === id);
    const settings = state.settings;

    if (!job || !settings) throw new Error('Job or settings not found');

    const now = new Date().toISOString();

    // Calculate totals
    const laborTotalCents = Math.round(job.laborHours * job.laborRateCents);
    
    // Separate inventory parts (income) from customer-provided parts (pass-through)
    const inventoryParts = (job.parts || []).filter(p => p.source !== 'customer-provided');
    const passThroughParts = (job.parts || []).filter(p => p.source === 'customer-provided');
    
    const partsTotalCents = inventoryParts.reduce(
      (sum, part) => sum + part.quantity * part.unitPriceCents,
      0
    );
    const passThroughPartsCents = passThroughParts.reduce(
      (sum, part) => sum + part.quantity * part.unitPriceCents,
      0
    );
    
    // Subtotal includes everything for invoice display
    const subtotalCents = laborTotalCents + partsTotalCents + passThroughPartsCents + job.miscFeesCents;
    const taxCents = Math.round(subtotalCents * (job.taxRate / 100));
    const totalCents = subtotalCents + taxCents;
    
    // Income amount excludes pass-through parts (what we actually earned)
    const incomeAmountCents = laborTotalCents + partsTotalCents + job.miscFeesCents + 
      Math.round((laborTotalCents + partsTotalCents + job.miscFeesCents) * (job.taxRate / 100));

    // Generate invoice number
    const invoiceNumber = `${settings.invoicePrefix}${settings.nextInvoiceNumber}`;

    // Create invoice
    const invoice: Invoice = {
      id: uuidv4(),
      invoiceNumber,
      jobId: id,
      customerId: job.customerId,
      invoiceDate: now,
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
      laborTotalCents,
      partsTotalCents,
      passThroughPartsCents,
      miscFeesCents: job.miscFeesCents,
      subtotalCents,
      taxCents,
      totalCents,
      incomeAmountCents,
      paidAmountCents: 0,
      paymentStatus: 'unpaid',
      payments: [],
      createdAt: now,
      updatedAt: now,
    };

    // Update job status
    const updatedJob: Job = {
      ...job,
      status: 'invoiced',
      invoiceId: invoice.id,
      updatedAt: now,
    };

    // Update settings with next invoice number
    const updatedSettings = {
      ...settings,
      nextInvoiceNumber: settings.nextInvoiceNumber + 1,
    };

    // Save to DB
    await Promise.all([
      db.put('invoices', invoice),
      db.put('jobs', updatedJob),
      db.put('settings', { ...updatedSettings, id: 'default' } as any),
    ]);

    const auditLog: AuditLog = {
      id: uuidv4(),
      entityType: 'invoice',
      entityId: invoice.id,
      action: 'created',
      details: `Invoice ${invoiceNumber} generated for job`,
      timestamp: now,
    };
    await db.put('auditLog', auditLog);

    set((state) => ({
      jobs: state.jobs.map((j) => (j.id === id ? updatedJob : j)),
      invoices: [...state.invoices, invoice],
      settings: updatedSettings,
      auditLogs: [...state.auditLogs, auditLog],
    }));

    return invoice;
  },

  updateInvoice: async (id, updates) => {
    const db = await getDB();
    const invoice = get().invoices.find((i) => i.id === id);
    if (!invoice) return;

    const updatedInvoice = {
      ...invoice,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await db.put('invoices', updatedInvoice);

    set((state) => ({
      invoices: state.invoices.map((i) => (i.id === id ? updatedInvoice : i)),
    }));
  },

  recalculateInvoice: async (id) => {
    const db = await getDB();
    const state = get();
    const invoice = state.invoices.find((i) => i.id === id);
    const job = invoice ? state.jobs.find((j) => j.id === invoice.jobId) : null;
    
    if (!invoice || !job) return;

    const now = new Date().toISOString();

    // Recalculate totals from job
    const laborTotalCents = Math.round(job.laborHours * job.laborRateCents);
    
    const inventoryParts = (job.parts || []).filter(p => p.source !== 'customer-provided');
    const passThroughParts = (job.parts || []).filter(p => p.source === 'customer-provided');
    
    const partsTotalCents = inventoryParts.reduce(
      (sum, part) => sum + part.quantity * part.unitPriceCents,
      0
    );
    const passThroughPartsCents = passThroughParts.reduce(
      (sum, part) => sum + part.quantity * part.unitPriceCents,
      0
    );
    
    const subtotalCents = laborTotalCents + partsTotalCents + passThroughPartsCents + job.miscFeesCents;
    const taxCents = Math.round(subtotalCents * (job.taxRate / 100));
    const totalCents = subtotalCents + taxCents;
    
    const incomeAmountCents = laborTotalCents + partsTotalCents + job.miscFeesCents + 
      Math.round((laborTotalCents + partsTotalCents + job.miscFeesCents) * (job.taxRate / 100));

    // Update payment status based on new total
    let paymentStatus: Invoice['paymentStatus'] = 'unpaid';
    if (invoice.paidAmountCents > totalCents) {
      paymentStatus = 'overpaid';
    } else if (invoice.paidAmountCents >= totalCents) {
      paymentStatus = 'paid';
    } else if (invoice.paidAmountCents > 0) {
      paymentStatus = 'partial';
    }

    const updatedInvoice: Invoice = {
      ...invoice,
      laborTotalCents,
      partsTotalCents,
      passThroughPartsCents,
      miscFeesCents: job.miscFeesCents,
      subtotalCents,
      taxCents,
      totalCents,
      incomeAmountCents,
      paymentStatus,
      updatedAt: now,
    };

    await db.put('invoices', updatedInvoice);

    // Update job status based on payment
    let newJobStatus = job.status;
    if (paymentStatus === 'paid' || paymentStatus === 'overpaid') {
      newJobStatus = 'paid';
    } else {
      newJobStatus = 'invoiced';
    }

    if (newJobStatus !== job.status) {
      const updatedJob = { ...job, status: newJobStatus, updatedAt: now };
      await db.put('jobs', updatedJob);
      set((state) => ({
        jobs: state.jobs.map((j) => (j.id === job.id ? updatedJob : j)),
      }));
    }

    const auditLog: AuditLog = {
      id: uuidv4(),
      entityType: 'invoice',
      entityId: id,
      action: 'updated',
      details: `Invoice ${invoice.invoiceNumber} recalculated. New total: $${(totalCents / 100).toFixed(2)}`,
      timestamp: now,
    };
    await db.put('auditLog', auditLog);

    set((state) => ({
      invoices: state.invoices.map((i) => (i.id === id ? updatedInvoice : i)),
      auditLogs: [...state.auditLogs, auditLog],
    }));
  },

  recordPayment: async (id, amountCents, method, notes) => {
    const db = await getDB();
    const state = get();
    const invoice = state.invoices.find((i) => i.id === id);
    if (!invoice) return;

    const now = new Date().toISOString();

    // Create payment record
    const payment: Payment = {
      id: uuidv4(),
      invoiceId: id,
      amountCents,
      type: 'payment',
      method,
      notes,
      date: now,
      createdAt: now,
    };

    await db.put('payments', payment);

    const newPaidAmount = invoice.paidAmountCents + amountCents;

    let paymentStatus: Invoice['paymentStatus'] = 'partial';
    if (newPaidAmount > invoice.totalCents) {
      paymentStatus = 'overpaid';
    } else if (newPaidAmount >= invoice.totalCents) {
      paymentStatus = 'paid';
    } else if (newPaidAmount === 0) {
      paymentStatus = 'unpaid';
    }

    const updatedInvoice: Invoice = {
      ...invoice,
      paidAmountCents: newPaidAmount,
      paymentStatus,
      paymentMethod: method,
      paymentDate: now,
      paymentNotes: notes || invoice.paymentNotes,
      payments: [...(invoice.payments || []), payment],
      updatedAt: now,
    };

    await db.put('invoices', updatedInvoice);

    // If fully paid, update job status
    if (paymentStatus === 'paid' || paymentStatus === 'overpaid') {
      const job = state.jobs.find((j) => j.id === invoice.jobId);
      if (job) {
        const updatedJob = { ...job, status: 'paid' as const, updatedAt: now };
        await db.put('jobs', updatedJob);
        set((state) => ({
          jobs: state.jobs.map((j) => (j.id === invoice.jobId ? updatedJob : j)),
        }));
      }
    }

    const auditLog: AuditLog = {
      id: uuidv4(),
      entityType: 'payment',
      entityId: payment.id,
      action: 'paid',
      details: `Payment of $${(amountCents / 100).toFixed(2)} recorded`,
      timestamp: now,
    };
    await db.put('auditLog', auditLog);

    set((state) => ({
      payments: [...state.payments, payment],
      invoices: state.invoices.map((i) => (i.id === id ? updatedInvoice : i)),
      auditLogs: [...state.auditLogs, auditLog],
    }));
  },

  recordRefund: async (invoiceId, amountCents, method, notes) => {
    const db = await getDB();
    const state = get();
    const invoice = state.invoices.find((i) => i.id === invoiceId);
    if (!invoice) return;

    const now = new Date().toISOString();

    // Create refund record (negative payment)
    const payment: Payment = {
      id: uuidv4(),
      invoiceId,
      amountCents,
      type: 'refund',
      method,
      notes,
      date: now,
      createdAt: now,
    };

    await db.put('payments', payment);

    const newPaidAmount = invoice.paidAmountCents - amountCents;

    let paymentStatus: Invoice['paymentStatus'] = 'partial';
    if (newPaidAmount <= 0) {
      paymentStatus = 'unpaid';
    } else if (newPaidAmount >= invoice.totalCents) {
      paymentStatus = 'paid';
    }

    const updatedInvoice: Invoice = {
      ...invoice,
      paidAmountCents: Math.max(0, newPaidAmount),
      paymentStatus,
      payments: [...(invoice.payments || []), payment],
      updatedAt: now,
    };

    await db.put('invoices', updatedInvoice);

    const auditLog: AuditLog = {
      id: uuidv4(),
      entityType: 'payment',
      entityId: payment.id,
      action: 'refunded',
      details: `Refund of $${(amountCents / 100).toFixed(2)} recorded`,
      timestamp: now,
    };
    await db.put('auditLog', auditLog);

    set((state) => ({
      payments: [...state.payments, payment],
      invoices: state.invoices.map((i) => (i.id === invoiceId ? updatedInvoice : i)),
      auditLogs: [...state.auditLogs, auditLog],
    }));
  },

  getPaymentsByInvoice: (invoiceId) => {
    return get().payments.filter((p) => p.invoiceId === invoiceId);
  },

  // Reminder actions
  addReminder: async (reminderData) => {
    const db = await getDB();
    const now = new Date().toISOString();
    const reminder: Reminder = {
      ...reminderData,
      id: uuidv4(),
      completed: false,
      createdAt: now,
      updatedAt: now,
    };

    await db.put('reminders', reminder);

    const auditLog: AuditLog = {
      id: uuidv4(),
      entityType: 'reminder',
      entityId: reminder.id,
      action: 'created',
      details: `Reminder "${reminder.title}" created`,
      timestamp: now,
    };
    await db.put('auditLog', auditLog);

    set((state) => ({
      reminders: [...state.reminders, reminder],
      auditLogs: [...state.auditLogs, auditLog],
    }));

    return reminder;
  },

  updateReminder: async (id, updates) => {
    const db = await getDB();
    const reminder = get().reminders.find((r) => r.id === id);
    if (!reminder) return;

    const updatedReminder = {
      ...reminder,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await db.put('reminders', updatedReminder);

    set((state) => ({
      reminders: state.reminders.map((r) => (r.id === id ? updatedReminder : r)),
    }));
  },

  completeReminder: async (id) => {
    const now = new Date().toISOString();
    await get().updateReminder(id, { completed: true, completedAt: now });
  },

  deleteReminder: async (id) => {
    const db = await getDB();
    await db.delete('reminders', id);

    set((state) => ({
      reminders: state.reminders.filter((r) => r.id !== id),
    }));
  },

  getRemindersByJob: (jobId) => {
    return get().reminders.filter((r) => r.jobId === jobId);
  },

  getRemindersByCustomer: (customerId) => {
    return get().reminders.filter((r) => r.customerId === customerId);
  },

  getUpcomingReminders: (days = 30) => {
    const now = new Date();
    const futureDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    
    return get().reminders
      .filter((r) => {
        if (r.completed) return false;
        const dueDate = new Date(r.dueDate);
        return dueDate >= now && dueDate <= futureDate;
      })
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  },

  // Attachment actions
  addAttachment: async (attachmentData) => {
    const db = await getDB();
    const now = new Date().toISOString();
    const attachment: Attachment = {
      ...attachmentData,
      id: uuidv4(),
      createdAt: now,
    };

    await db.put('attachments', attachment);

    set((state) => ({
      attachments: [...state.attachments, attachment],
    }));

    return attachment;
  },

  deleteAttachment: async (id) => {
    const db = await getDB();
    await db.delete('attachments', id);

    set((state) => ({
      attachments: state.attachments.filter((a) => a.id !== id),
    }));
  },

  getAttachmentsByJob: (jobId) => {
    return get().attachments.filter((a) => a.jobId === jobId);
  },

  // Inventory item actions
  addInventoryItem: async (itemData) => {
    const db = await getDB();
    const now = new Date().toISOString();
    const item: InventoryItem = {
      ...itemData,
      id: uuidv4(),
      createdAt: now,
      updatedAt: now,
    };

    await db.put('inventoryItems', item);

    const auditLog: AuditLog = {
      id: uuidv4(),
      entityType: 'inventory',
      entityId: item.id,
      action: 'created',
      details: `Inventory item "${item.name}" created`,
      timestamp: now,
    };
    await db.put('auditLog', auditLog);

    set((state) => ({
      inventoryItems: [...state.inventoryItems, item],
      auditLogs: [...state.auditLogs, auditLog],
    }));

    return item;
  },

  updateInventoryItem: async (id, updates) => {
    const db = await getDB();
    const item = get().inventoryItems.find((i) => i.id === id);
    if (!item) return;

    const updatedItem = {
      ...item,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await db.put('inventoryItems', updatedItem);

    set((state) => ({
      inventoryItems: state.inventoryItems.map((i) => (i.id === id ? updatedItem : i)),
    }));
  },

  deleteInventoryItem: async (id) => {
    const db = await getDB();
    const item = get().inventoryItems.find((i) => i.id === id);
    if (!item) return;

    await db.delete('inventoryItems', id);

    const auditLog: AuditLog = {
      id: uuidv4(),
      entityType: 'inventory',
      entityId: id,
      action: 'deleted',
      details: `Inventory item "${item.name}" deleted`,
      timestamp: new Date().toISOString(),
    };
    await db.put('auditLog', auditLog);

    set((state) => ({
      inventoryItems: state.inventoryItems.filter((i) => i.id !== id),
      auditLogs: [...state.auditLogs, auditLog],
    }));
  },

  addExpense: async (expenseData) => {
    const db = await getDB();
    const now = new Date().toISOString();
    const expense: Expense = {
      ...expenseData,
      id: uuidv4(),
      createdAt: now,
      updatedAt: now,
    };

    await db.put('expenses', expense);

    set((state) => ({
      expenses: [...state.expenses, expense],
    }));

    return expense;
  },

  updateExpense: async (id, updates) => {
    const db = await getDB();
    const expense = get().expenses.find((e) => e.id === id);
    if (!expense) return;

    const updatedExpense = {
      ...expense,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await db.put('expenses', updatedExpense);

    set((state) => ({
      expenses: state.expenses.map((e) => (e.id === id ? updatedExpense : e)),
    }));
  },

  deleteExpense: async (id) => {
    const db = await getDB();
    await db.delete('expenses', id);

    set((state) => ({
      expenses: state.expenses.filter((e) => e.id !== id),
    }));
  },

  updateSettings: async (updates) => {
    const db = await getDB();
    const settings = get().settings;
    if (!settings) return;

    const updatedSettings = { ...settings, ...updates };
    await db.put('settings', { ...updatedSettings, id: 'default' } as any);

    set({ settings: updatedSettings });
  },

  getCustomerById: (id) => {
    return get().customers.find((c) => c.id === id);
  },

  getJobsByCustomer: (customerId) => {
    return get().jobs.filter((j) => j.customerId === customerId);
  },

  getInvoicesByCustomer: (customerId) => {
    return get().invoices.filter((i) => i.customerId === customerId);
  },

  getCustomerTotalSpend: (customerId) => {
    return get()
      .invoices.filter((i) => i.customerId === customerId)
      .reduce((sum, i) => sum + i.paidAmountCents, 0);
  },

  getCustomerOutstandingBalance: (customerId) => {
    return get()
      .invoices.filter((i) => i.customerId === customerId && i.paymentStatus !== 'paid')
      .reduce((sum, i) => sum + (i.totalCents - i.paidAmountCents), 0);
  },

  exportData: async () => {
    // Read directly from IndexedDB to ensure we get actual persisted data
    const db = await getDB();
    const [customers, jobs, invoices, expenses, payments, reminders, attachments, inventoryItems, settingsRecord] = await Promise.all([
      db.getAll('customers'),
      db.getAll('jobs'),
      db.getAll('invoices'),
      db.getAll('expenses'),
      db.getAll('payments'),
      db.getAll('reminders'),
      db.getAll('attachments'),
      db.getAll('inventoryItems'),
      db.get('settings', 'default'),
    ]);

    const exportPayload = {
      version: 3,
      exportDate: new Date().toISOString(),
      customers,
      jobs,
      invoices,
      expenses,
      payments,
      reminders,
      attachments,
      inventoryItems,
      settings: settingsRecord || null,
    };
    return JSON.stringify(exportPayload, null, 2);
  },

  importData: async (jsonData) => {
    const db = await getDB();
    const data = JSON.parse(jsonData);

    // Clear existing data
    await Promise.all([
      db.clear('customers'),
      db.clear('jobs'),
      db.clear('invoices'),
      db.clear('expenses'),
      db.clear('payments'),
      db.clear('reminders'),
      db.clear('attachments'),
      db.clear('inventoryItems'),
    ]);

    // Import new data
    for (const customer of data.customers || []) {
      await db.put('customers', customer);
    }
    for (const job of data.jobs || []) {
      await db.put('jobs', job);
    }
    for (const invoice of data.invoices || []) {
      await db.put('invoices', invoice);
    }
    for (const expense of data.expenses || []) {
      await db.put('expenses', expense);
    }
    for (const payment of data.payments || []) {
      await db.put('payments', payment);
    }
    for (const reminder of data.reminders || []) {
      await db.put('reminders', reminder);
    }
    for (const attachment of data.attachments || []) {
      await db.put('attachments', attachment);
    }
    for (const item of data.inventoryItems || []) {
      await db.put('inventoryItems', item);
    }
    if (data.settings) {
      await db.put('settings', { ...data.settings, id: 'default' });
    }

    // Reload state
    await get().initialize();
  },
}));
