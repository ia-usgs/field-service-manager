import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { Customer, Job, Invoice, Expense, AppSettings, AuditLog, Part } from '@/types';
import { getDB, initializeSettings } from '@/lib/db';

interface AppState {
  // Data
  customers: Customer[];
  jobs: Job[];
  invoices: Invoice[];
  expenses: Expense[];
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
  deleteJob: (id: string) => Promise<void>;
  completeJob: (id: string) => Promise<Invoice>;

  // Invoice actions
  updateInvoice: (id: string, updates: Partial<Invoice>) => Promise<void>;
  recordPayment: (id: string, amountCents: number, method: string, notes?: string) => Promise<void>;

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
  settings: null,
  auditLogs: [],
  isLoading: true,

  initialize: async () => {
    const db = await getDB();
    const settings = await initializeSettings();

    const [customers, jobs, invoices, expenses, auditLogs] = await Promise.all([
      db.getAll('customers'),
      db.getAll('jobs'),
      db.getAll('invoices'),
      db.getAll('expenses'),
      db.getAll('auditLog'),
    ]);

    set({
      customers,
      jobs,
      invoices,
      expenses,
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
      auditLogs: [...state.auditLogs, auditLog],
    }));

    return job;
  },

  updateJob: async (id, updates) => {
    const db = await getDB();
    const job = get().jobs.find((j) => j.id === id);
    if (!job) return;

    const updatedJob = {
      ...job,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await db.put('jobs', updatedJob);

    set((state) => ({
      jobs: state.jobs.map((j) => (j.id === id ? updatedJob : j)),
    }));
  },

  deleteJob: async (id) => {
    const db = await getDB();
    const job = get().jobs.find((j) => j.id === id);
    if (!job) return;

    // Don't allow deletion of invoiced or paid jobs
    if (job.status === 'invoiced' || job.status === 'paid') {
      throw new Error('Cannot delete invoiced or paid jobs');
    }

    await db.delete('jobs', id);

    const auditLog: AuditLog = {
      id: uuidv4(),
      entityType: 'job',
      entityId: id,
      action: 'deleted',
      details: `Job deleted`,
      timestamp: new Date().toISOString(),
    };
    await db.put('auditLog', auditLog);

    set((state) => ({
      jobs: state.jobs.filter((j) => j.id !== id),
      auditLogs: [...state.auditLogs, auditLog],
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
    const partsTotalCents = job.parts.reduce(
      (sum, part) => sum + part.quantity * part.unitPriceCents,
      0
    );
    const subtotalCents = laborTotalCents + partsTotalCents + job.miscFeesCents;
    const taxCents = Math.round(subtotalCents * (job.taxRate / 100));
    const totalCents = subtotalCents + taxCents;

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
      miscFeesCents: job.miscFeesCents,
      subtotalCents,
      taxCents,
      totalCents,
      paidAmountCents: 0,
      paymentStatus: 'unpaid',
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

  recordPayment: async (id, amountCents, method, notes) => {
    const db = await getDB();
    const state = get();
    const invoice = state.invoices.find((i) => i.id === id);
    if (!invoice) return;

    const newPaidAmount = invoice.paidAmountCents + amountCents;
    const now = new Date().toISOString();

    let paymentStatus: Invoice['paymentStatus'] = 'partial';
    if (newPaidAmount >= invoice.totalCents) {
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
      updatedAt: now,
    };

    await db.put('invoices', updatedInvoice);

    // If fully paid, update job status
    if (paymentStatus === 'paid') {
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
      entityType: 'invoice',
      entityId: id,
      action: 'paid',
      details: `Payment of $${(amountCents / 100).toFixed(2)} recorded`,
      timestamp: now,
    };
    await db.put('auditLog', auditLog);

    set((state) => ({
      invoices: state.invoices.map((i) => (i.id === id ? updatedInvoice : i)),
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
    const state = get();
    const exportData = {
      version: 1,
      exportDate: new Date().toISOString(),
      customers: state.customers,
      jobs: state.jobs,
      invoices: state.invoices,
      expenses: state.expenses,
      settings: state.settings,
    };
    return JSON.stringify(exportData, null, 2);
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
    ]);

    // Import new data
    for (const customer of data.customers) {
      await db.put('customers', customer);
    }
    for (const job of data.jobs) {
      await db.put('jobs', job);
    }
    for (const invoice of data.invoices) {
      await db.put('invoices', invoice);
    }
    for (const expense of data.expenses) {
      await db.put('expenses', expense);
    }
    if (data.settings) {
      await db.put('settings', { ...data.settings, id: 'default' });
    }

    // Reload state
    await get().initialize();
  },
}));
