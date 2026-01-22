// All monetary values stored as cents (integers) to prevent floating point errors

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  archived: boolean;
}

// Inventory item for manual parts management
export interface InventoryItem {
  id: string;
  name: string;
  sku?: string;
  description?: string;
  unitCostCents: number; // What we paid
  unitPriceCents: number; // What we charge
  quantity: number; // Stock quantity
  reorderLevel?: number;
  category?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Part {
  id: string;
  name: string;
  quantity: number;
  unitCostCents: number; // What we paid
  unitPriceCents: number; // What we charge
  source: 'inventory' | 'customer-provided'; // inventory = we mark up & sell; customer-provided = pass-through (not income)
  inventoryItemId?: string; // Link to InventoryItem if selected from inventory
}

export interface Reminder {
  id: string;
  jobId: string;
  customerId: string;
  type: 'follow-up' | 'maintenance' | 'annual-checkup' | 'custom';
  title: string;
  description: string;
  dueDate: string;
  completed: boolean;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Attachment {
  id: string;
  jobId: string;
  type: 'photo-before' | 'photo-after' | 'receipt' | 'document';
  name: string;
  mimeType: string;
  // Tauri desktop: filesystem path only (no base64 in IndexedDB)
  filePath: string;
  // Metadata only (safe for IndexedDB)
  size: number;
  createdAt: string;
}

export interface Job {
  id: string;
  customerId: string;
  dateOfService: string;
  problemDescription: string;
  workPerformed: string;
  laborHours: number;
  laborRateCents: number;
  parts: Part[];
  miscFeesCents: number;
  miscFeesDescription: string;
  taxRate: number; // Percentage e.g., 8.5
  status: 'quoted' | 'in-progress' | 'completed' | 'invoiced' | 'paid';
  technicianNotes: string;
  createdAt: string;
  updatedAt: string;
  invoiceId?: string;
  reminders?: Reminder[];
  attachments?: Attachment[];
}

export interface Payment {
  id: string;
  invoiceId: string;
  amountCents: number;
  type: 'payment' | 'refund';
  method: string;
  notes?: string;
  date: string;
  createdAt: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  jobId: string;
  customerId: string;
  invoiceDate: string;
  dueDate: string;
  laborTotalCents: number;
  partsTotalCents: number; // Only inventory parts (actual income)
  passThroughPartsCents: number; // Customer-paid parts (not income)
  miscFeesCents: number;
  subtotalCents: number;
  taxCents: number;
  totalCents: number; // Full invoice amount including pass-through
  incomeAmountCents: number; // Actual income (excludes pass-through parts)
  paidAmountCents: number;
  paymentStatus: 'unpaid' | 'partial' | 'paid' | 'overpaid';
  payments?: Payment[];
  // Legacy fields for backward compatibility
  paymentMethod?: string;
  paymentDate?: string;
  paymentNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Expense {
  id: string;
  date: string;
  vendor: string;
  category: 'parts' | 'tools' | 'consumables' | 'vehicle' | 'fuel' | 'misc';
  description: string;
  amountCents: number;
  jobId?: string;
  customerId?: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppSettings {
  defaultLaborRateCents: number;
  defaultTaxRate: number;
  invoicePrefix: string;
  nextInvoiceNumber: number;
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  companyLogo?: string; // Base64 data URL for custom logo
  groqApiKey?: string; // API key for Groq AI assistant
}

export interface AuditLog {
  id: string;
  entityType: 'customer' | 'job' | 'invoice' | 'expense' | 'payment' | 'reminder' | 'inventory';
  entityId: string;
  action: 'created' | 'updated' | 'deleted' | 'paid' | 'refunded';
  details: string;
  timestamp: string;
}

export interface ErrorLog {
  id: string;
  level: 'error' | 'warning' | 'info';
  message: string;
  stack?: string;
  source?: string;
  timestamp: string;
}
