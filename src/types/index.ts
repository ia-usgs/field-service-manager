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

export interface Part {
  id: string;
  name: string;
  quantity: number;
  unitCostCents: number; // What we paid
  unitPriceCents: number; // What we charge
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
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  jobId: string;
  customerId: string;
  invoiceDate: string;
  dueDate: string;
  laborTotalCents: number;
  partsTotalCents: number;
  miscFeesCents: number;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  paidAmountCents: number;
  paymentStatus: 'unpaid' | 'partial' | 'paid';
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
}

export interface AuditLog {
  id: string;
  entityType: 'customer' | 'job' | 'invoice' | 'expense';
  entityId: string;
  action: 'created' | 'updated' | 'deleted' | 'paid';
  details: string;
  timestamp: string;
}
