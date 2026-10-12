export type PaymentMode = "Cash" | "UPI" | "Bank Transfer - IMPS/RTGS";

export interface PaymentDetails {
  mode: PaymentMode;
  fromAccount?: string; // Company bank account / cash drawer
  // UPI fields
  upiId?: string;
  mobileNumber?: string;
  // Bank fields
  toAccountNumber?: string;
  toBankName?: string;
  toIfsc?: string;
  toAccountName?: string;
  transactionId?: string;
  // Cash fields
  cashDescription?: string;
}

// Immutable Audit Log
export interface AuditLogEntry {
  id?: string;
  timestamp: string; // ISO string
  performedByUid: string;
  performedByEmail: string;
  performedByName: string;
  module: "STAFF_LEDGER" | "VENDOR_LEDGER" | "GENERAL_LEDGER" | "VENDOR_BANK_UPDATE" | "SYSTEM";
  action: "CREATE" | "UPDATE" | "TOP_UP" | "DISBURSE" | "SETTLE";
  targetId: string; // Staff ID, Vendor ID, or Float ID
  targetName: string;
  previousData?: any;
  newData: any;
  notes?: string;
}

// 1. Staff Credit Account
export interface StaffAccount {
  id: string; // references users collection uid
  staffUid: string;
  staffName: string;
  staffEmail: string;
  staffMobile: string;
  monthlySalary: number;
  totalAdvanceGiven: number;
  totalPendingDue: number;
  lastPaymentDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StaffTransaction {
  id: string;
  staffUid: string;
  type: "SALARY_CREDIT" | "ADVANCE_PAYMENT" | "SETTLEMENT_PAYMENT";
  amount: number;
  date: string;
  paymentDetails: PaymentDetails;
  remarks?: string;
  createdAt: string;
  createdByUid: string;
  createdByEmail: string;
}

// 2. Vendor Credit Account
export interface VendorBankAccount {
  id: string;
  accountNumber: string;
  ifscCode: string;
  accountName: string;
  bankName: string;
  tag: "Main Account" | "Family" | "Friend" | "Staff" | string;
}

export interface VendorUpiAccount {
  id: string;
  upiId: string;
  mobileNumber?: string;
  qrCodeUrl?: string;
  tag: "Main UPI" | "Family" | "Friend" | "Staff" | string;
}

export interface VendorAccount {
  id: string;
  vendorName: string;
  mobileNumber: string;
  isMobileVerified: boolean;
  category: string;
  bankAccounts: VendorBankAccount[];
  upiAccounts: VendorUpiAccount[];
  currentBalance: number; // Positive = we owe vendor; Negative = advance given
  totalPurchases: number;
  totalPaid: number;
  createdAt: string;
  updatedAt: string;
}

export interface VendorPurchase {
  id: string;
  vendorId: string;
  vendorName: string;
  date: string;
  amount: number;
  itemsDescription: string;
  type: "Service" | "Procurement" | "Rental";
  purchaseMadeByStaffUid: string;
  purchaseMadeByStaffName: string;
  linkedWeddingIds: string[]; // CRM Wedding IDs
  linkedWeddingNames?: string[];
  isRecurring: boolean;
  recurringFrequency?: "Daily" | "Weekly" | "Monthly" | "Quarterly" | "Yearly";
  createdAt: string;
  createdByUid: string;
}

export interface VendorTransaction {
  id: string;
  vendorId: string;
  type: "PAYMENT" | "ADVANCE" | "PURCHASE_BILL";
  amount: number;
  date: string;
  paymentDetails: PaymentDetails;
  remarks?: string;
  createdAt: string;
  createdByUid: string;
  createdByEmail: string;
}

// 3. General Credit Ledger (Petty Cash / Floats)
export interface GeneralStaffFloat {
  id: string;
  staffUid: string;
  staffName: string;
  status: "ACTIVE" | "SETTLED";
  initialDisbursedAmount: number;
  totalTopUpAmount: number;
  totalSpentAmount: number;
  currentFloatBalance: number;
  disbursementPaymentDetails: PaymentDetails;
  createdAt: string;
  updatedAt: string;
  createdByUid: string;
}

export interface GeneralFloatExpense {
  id: string;
  floatId: string;
  staffUid: string;
  purchaseType: string; // Stay, Food, Fuel, Fastag, Internet, Misc, etc.
  amount: number;
  date: string;
  purchaseDetails: string;
  linkedWeddingIds?: string[];
  receiptUrl?: string;
  createdAt: string;
  createdByUid: string;
}