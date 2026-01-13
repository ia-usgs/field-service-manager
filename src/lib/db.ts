import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { Customer, Job, Invoice, Expense, AppSettings, AuditLog, Payment, Reminder, Attachment } from '@/types';

interface ServiceManagerDB extends DBSchema {
  customers: {
    key: string;
    value: Customer;
    indexes: { 'by-name': string; 'by-archived': number };
  };
  jobs: {
    key: string;
    value: Job;
    indexes: { 'by-customer': string; 'by-status': string; 'by-date': string };
  };
  invoices: {
    key: string;
    value: Invoice;
    indexes: { 'by-customer': string; 'by-job': string; 'by-status': string };
  };
  expenses: {
    key: string;
    value: Expense;
    indexes: { 'by-date': string; 'by-category': string };
  };
  payments: {
    key: string;
    value: Payment;
    indexes: { 'by-invoice': string; 'by-date': string };
  };
  reminders: {
    key: string;
    value: Reminder;
    indexes: { 'by-job': string; 'by-customer': string; 'by-due-date': string; 'by-completed': number };
  };
  attachments: {
    key: string;
    value: Attachment;
    indexes: { 'by-job': string };
  };
  settings: {
    key: string;
    value: AppSettings;
  };
  auditLog: {
    key: string;
    value: AuditLog;
    indexes: { 'by-entity': string; 'by-timestamp': string };
  };
}

const DB_NAME = 'service-manager-db';
const DB_VERSION = 3; // Bumped to force schema rebuild after removing attachment.data

let dbInstance: IDBPDatabase<ServiceManagerDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<ServiceManagerDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<ServiceManagerDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      // Customers store
      if (!db.objectStoreNames.contains('customers')) {
        const customerStore = db.createObjectStore('customers', { keyPath: 'id' });
        customerStore.createIndex('by-name', 'name');
        customerStore.createIndex('by-archived', 'archived');
      }

      // Jobs store
      if (!db.objectStoreNames.contains('jobs')) {
        const jobStore = db.createObjectStore('jobs', { keyPath: 'id' });
        jobStore.createIndex('by-customer', 'customerId');
        jobStore.createIndex('by-status', 'status');
        jobStore.createIndex('by-date', 'dateOfService');
      }

      // Invoices store
      if (!db.objectStoreNames.contains('invoices')) {
        const invoiceStore = db.createObjectStore('invoices', { keyPath: 'id' });
        invoiceStore.createIndex('by-customer', 'customerId');
        invoiceStore.createIndex('by-job', 'jobId');
        invoiceStore.createIndex('by-status', 'paymentStatus');
      }

      // Expenses store
      if (!db.objectStoreNames.contains('expenses')) {
        const expenseStore = db.createObjectStore('expenses', { keyPath: 'id' });
        expenseStore.createIndex('by-date', 'date');
        expenseStore.createIndex('by-category', 'category');
      }

      // Payments store (new in v2)
      if (!db.objectStoreNames.contains('payments')) {
        const paymentStore = db.createObjectStore('payments', { keyPath: 'id' });
        paymentStore.createIndex('by-invoice', 'invoiceId');
        paymentStore.createIndex('by-date', 'date');
      }

      // Reminders store (new in v2)
      if (!db.objectStoreNames.contains('reminders')) {
        const reminderStore = db.createObjectStore('reminders', { keyPath: 'id' });
        reminderStore.createIndex('by-job', 'jobId');
        reminderStore.createIndex('by-customer', 'customerId');
        reminderStore.createIndex('by-due-date', 'dueDate');
        reminderStore.createIndex('by-completed', 'completed');
      }

      // Attachments store (new in v2)
      if (!db.objectStoreNames.contains('attachments')) {
        const attachmentStore = db.createObjectStore('attachments', { keyPath: 'id' });
        attachmentStore.createIndex('by-job', 'jobId');
      }

      // Settings store
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'id' });
      }

      // Audit log store
      if (!db.objectStoreNames.contains('auditLog')) {
        const auditStore = db.createObjectStore('auditLog', { keyPath: 'id' });
        auditStore.createIndex('by-entity', 'entityId');
        auditStore.createIndex('by-timestamp', 'timestamp');
      }
    },
  });

  return dbInstance;
}

// Initialize default settings if not present
export async function initializeSettings(): Promise<AppSettings> {
  const db = await getDB();
  let settings = await db.get('settings', 'default');

  if (!settings) {
    settings = {
      defaultLaborRateCents: 8500, // $85/hour
      defaultTaxRate: 8.25,
      invoicePrefix: 'INV-',
      nextInvoiceNumber: 1001,
      companyName: 'Tech & Electrical Services',
      companyAddress: '',
      companyPhone: '',
      companyEmail: '',
    };
    await db.put('settings', { ...settings, id: 'default' } as any);
  }

  return settings;
}

// Helper to format cents to dollars
export function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

// Helper to parse dollars to cents
export function dollarsToCents(dollars: number | string): number {
  const value = typeof dollars === 'string' ? parseFloat(dollars) : dollars;
  return Math.round(value * 100);
}
