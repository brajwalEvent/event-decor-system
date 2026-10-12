"use client";

import React, { useState, useEffect } from "react";
import { db } from "../../../lib/firebase";
import {
  collection,
  getDocs,
  doc,
  setDoc,
  addDoc,
  query,
  where,
  updateDoc,
} from "firebase/firestore";
import { useAuth } from "../../../context/AuthContext";
import { useRouter } from "next/navigation";
import type {
  StaffAccount,
  StaffTransaction,
  PaymentMode,
  PaymentDetails,
} from "../../../types/accounting";
import { recordAuditLog } from "../../../lib/accountingAudit";

export default function StaffAccountingPage(): React.ReactElement {
  const { user, role, isSuperAdmin, loading } = useAuth();
  const router = useRouter();

  // Access Guard
  const isAccountant = role === "accountant";
  const canAccess = isSuperAdmin || isAccountant || role === "admin";

  const [availableUsers, setAvailableUsers] = useState<any[]>([]);
  const [staffAccounts, setStaffAccounts] = useState<StaffAccount[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<StaffAccount | null>(null);
  const [transactions, setTransactions] = useState<StaffTransaction[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Modals
  const [showOpenAccountModal, setShowOpenAccountModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  // New Account State
  const [selectedUserUid, setSelectedUserUid] = useState("");
  const [monthlySalaryInput, setMonthlySalaryInput] = useState<number | "">("");

  // Payment Form State
  const [txnType, setTxnType] = useState<"SALARY_CREDIT" | "ADVANCE_PAYMENT" | "SETTLEMENT_PAYMENT">("ADVANCE_PAYMENT");
  const [txnAmount, setTxnAmount] = useState<number | "">("");
  const [txnDate, setTxnDate] = useState(new Date().toISOString().split("T")[0]);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("Bank Transfer - IMPS/RTGS");
  const [remarks, setRemarks] = useState("");

  // Conditional Payment Fields
  const [upiId, setUpiId] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [toBankName, setToBankName] = useState("");
  const [toAccountNumber, setToAccountNumber] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [fromAccount, setFromAccount] = useState("");
  const [cashDescription, setCashDescription] = useState("");

  useEffect(() => {
    if (!loading && (!user || !canAccess)) {
      router.push("/handovers");
    }
  }, [user, role, isSuperAdmin, loading, canAccess, router]);

  // Fetch staff users and created accounts
  const loadInitialData = async () => {
    try {
      setLoadingData(true);

      const userSnap = await getDocs(collection(db, "users"));
      const usersList = userSnap.docs.map((d) => ({ uid: d.id, ...d.data() }));
      setAvailableUsers(usersList);

      const accSnap = await getDocs(collection(db, "accounting_staff_accounts"));
      const accountsList = accSnap.docs.map((d) => ({ id: d.id, ...d.data() } as StaffAccount));
      setStaffAccounts(accountsList);

      if (accountsList.length > 0 && !selectedStaff) {
        setSelectedStaff(accountsList[0]);
      }
    } catch (err) {
      console.error("Error fetching staff accounting:", err);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (user && canAccess) {
      loadInitialData();
    }
  }, [user, canAccess]);

  // Load transactions without requiring composite indexes
  const fetchTransactions = async (staffUid: string) => {
    try {
      // Query without composite index requirement
      const q = query(
        collection(db, "accounting_staff_transactions"),
        where("staffUid", "==", staffUid)
      );
      const snap = await getDocs(q);

      // In-memory sort by date descending
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as StaffTransaction))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      setTransactions(list);
    } catch (err) {
      console.error("Error fetching transactions:", err);
    }
  };

  useEffect(() => {
    if (selectedStaff) {
      fetchTransactions(selectedStaff.staffUid);
    }
  }, [selectedStaff]);

  // Open New Account
  // Open New Account
  const handleCreateStaffAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedUserUid || !monthlySalaryInput) return;

    const matchedUser = availableUsers.find((u) => u.uid === selectedUserUid);
    if (!matchedUser) return;

    try {
      const newAccount: StaffAccount = {
        id: matchedUser.uid,
        staffUid: matchedUser.uid,
        staffName: matchedUser.displayName || matchedUser.email,
        staffEmail: matchedUser.email,
        staffMobile: matchedUser.mobile || "—",
        monthlySalary: Number(monthlySalaryInput),
        totalAdvanceGiven: 0,
        totalPendingDue: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await setDoc(doc(db, "accounting_staff_accounts", matchedUser.uid), newAccount);

      await recordAuditLog(user, {
        module: "STAFF_LEDGER",
        action: "CREATE",
        targetId: matchedUser.uid,
        targetName: newAccount.staffName,
        newData: newAccount,
        notes: `Created salary account at ₹${monthlySalaryInput}/month`,
      });

      setShowOpenAccountModal(false);
      setSelectedUserUid("");
      setMonthlySalaryInput("");
      await loadInitialData();
      setSelectedStaff(newAccount);
      alert("✅ Staff Account successfully established.");
    } catch (err: any) {
      console.error(err);
      alert("Failed to initialize account: " + err.message);
    }
  };

  // Submit Payment/Ledger Transaction (no undefined fields)
  // Submit Payment/Ledger Transaction (no undefined fields)
  const handleRecordTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedStaff || !txnAmount) return;

    const parsedAmount = Number(txnAmount);

    // Build clean PaymentDetails without undefined
    const paymentDetails: PaymentDetails = { mode: paymentMode };

    if (fromAccount.trim()) {
      paymentDetails.fromAccount = fromAccount.trim();
    }

    if (paymentMode === "UPI") {
      if (upiId.trim()) paymentDetails.upiId = upiId.trim();
      if (mobileNumber.trim()) paymentDetails.mobileNumber = mobileNumber.trim();
    } else if (paymentMode === "Bank Transfer - IMPS/RTGS") {
      if (toBankName.trim()) paymentDetails.toBankName = toBankName.trim();
      if (toAccountNumber.trim()) paymentDetails.toAccountNumber = toAccountNumber.trim();
      if (transactionId.trim()) paymentDetails.transactionId = transactionId.trim();
    } else if (paymentMode === "Cash") {
      if (cashDescription.trim()) paymentDetails.cashDescription = cashDescription.trim();
    }

    try {
      const txnData: any = {
        staffUid: selectedStaff.staffUid,
        type: txnType,
        amount: parsedAmount,
        date: txnDate,
        paymentDetails,
        createdAt: new Date().toISOString(),
        createdByUid: user?.uid || "",
        createdByEmail: user?.email || "Unknown",
      };

      if (remarks.trim()) {
        txnData.remarks = remarks.trim();
      }

      await addDoc(collection(db, "accounting_staff_transactions"), txnData);

      // Recalculate balances
      let updatedAdvance = selectedStaff.totalAdvanceGiven;
      let updatedDue = selectedStaff.totalPendingDue;

      if (txnType === "ADVANCE_PAYMENT") {
        updatedAdvance += parsedAmount;
      } else if (txnType === "SALARY_CREDIT") {
        updatedDue = Math.max(0, updatedDue - parsedAmount);
      } else if (txnType === "SETTLEMENT_PAYMENT") {
        updatedAdvance = Math.max(0, updatedAdvance - parsedAmount);
      }

      const updatedFields = {
        totalAdvanceGiven: updatedAdvance,
        totalPendingDue: updatedDue,
        lastPaymentDate: txnDate,
        updatedAt: new Date().toISOString(),
      };

      await updateDoc(doc(db, "accounting_staff_accounts", selectedStaff.staffUid), updatedFields);

      await recordAuditLog(user, {
        module: "STAFF_LEDGER",
        action: "UPDATE",
        targetId: selectedStaff.staffUid,
        targetName: selectedStaff.staffName,
        previousData: {
          advance: selectedStaff.totalAdvanceGiven,
          due: selectedStaff.totalPendingDue,
        },
        newData: {
          ...updatedFields,
          transaction: txnData,
        },
        notes: `Recorded ${txnType} of ₹${parsedAmount} via ${paymentMode}`,
      });

      // Reset Modal
      setShowPaymentModal(false);
      setTxnAmount("");
      setRemarks("");
      setUpiId("");
      setMobileNumber("");
      setToBankName("");
      setToAccountNumber("");
      setTransactionId("");
      setCashDescription("");

      setSelectedStaff({
        ...selectedStaff,
        ...updatedFields,
      });
      fetchTransactions(selectedStaff.staffUid);
      alert("✅ Transaction logged to ledger.");
    } catch (err: any) {
      console.error(err);
      alert("Transaction failed: " + err.message);
    }
  };

  if (loading || loadingData) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center font-mono text-xs uppercase tracking-wider text-neutral-600">
        INITIALIZING SECURE LEDGER...
      </div>
    );
  }

  const unassignedStaffUsers = availableUsers.filter(
    (u) => !staffAccounts.some((acc) => acc.staffUid === u.uid)
  );

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-neutral-900 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
       
       <div className="mb-4">
  <button
    onClick={() => router.push("/accounting")}
    className="text-xs font-bold text-gray-700 hover:text-black flex items-center gap-1 bg-white border border-gray-300 px-3.5 py-1.5 rounded-lg shadow-sm transition"
  >
    ← Back to Accounting Dashboard
  </button>
</div>

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-neutral-300 gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 bg-neutral-900 rounded-full animate-pulse" />
              <p className="text-[10px] uppercase font-mono font-black tracking-widest text-neutral-500">
                BRAJWAL ERP / ACCOUNTING MODULE
              </p>
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-neutral-950 mt-1">
              Staff Credit Accounts & Salary Ledger
            </h1>
          </div>

          <button
            onClick={() => setShowOpenAccountModal(true)}
            className="px-5 py-2.5 rounded-lg font-black text-xs uppercase tracking-wider bg-neutral-900 text-white hover:bg-neutral-800 transition shadow-[4px_4px_10px_rgba(0,0,0,0.15)] active:translate-y-0.5"
          >
            + Open Staff Account
          </button>
        </div>

        {/* Master Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Staff Accounts List */}
          <div className="lg:col-span-4 space-y-4">
            <div className="bg-white rounded-xl p-4 border border-neutral-200 shadow-[6px_6px_16px_#e5e7eb,-6px_-6px_16px_#ffffff]">
              <h2 className="text-xs font-mono font-black tracking-widest uppercase text-neutral-500 mb-3">
                Active Staff Accounts ({staffAccounts.length})
              </h2>

              {staffAccounts.length === 0 ? (
                <div className="text-center py-8 text-xs font-mono text-neutral-400">
                  NO ACCOUNTS CONFIGURED YET.
                </div>
              ) : (
                <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                  {staffAccounts.map((acc) => {
                    const isSelected = selectedStaff?.staffUid === acc.staffUid;
                    return (
                      <div
                        key={acc.staffUid}
                        onClick={() => setSelectedStaff(acc)}
                        className={`p-4 rounded-xl cursor-pointer transition border ${
                          isSelected
                            ? "bg-neutral-900 text-white border-neutral-900 shadow-inner"
                            : "bg-white text-neutral-900 border-neutral-200 hover:border-neutral-400 shadow-sm"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <p className="font-black text-sm tracking-tight">{acc.staffName}</p>
                          <span
                            className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                              isSelected
                                ? "bg-neutral-800 text-neutral-200"
                                : "bg-neutral-100 text-neutral-600"
                            }`}
                          >
                            ₹{acc.monthlySalary.toLocaleString()}/mo
                          </span>
                        </div>
                        <p className={`text-xs mt-1 ${isSelected ? "text-neutral-400" : "text-neutral-500"}`}>
                          {acc.staffEmail}
                        </p>
                        <div className="mt-3 pt-2 border-t border-neutral-200/20 flex justify-between text-[11px] font-mono">
                          <span>
                            Advance: <strong className="text-amber-500">₹{acc.totalAdvanceGiven}</strong>
                          </span>
                          <span>
                            Due: <strong className="text-rose-500">₹{acc.totalPendingDue}</strong>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Ledger Details */}
          <div className="lg:col-span-8 space-y-6">
            {selectedStaff ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white p-5 rounded-xl border border-neutral-200 shadow-[6px_6px_16px_#e5e7eb,-6px_-6px_16px_#ffffff]">
                    <p className="text-[10px] font-mono uppercase font-black tracking-widest text-neutral-400">
                      Agreed Salary
                    </p>
                    <p className="text-2xl font-black tracking-tight text-neutral-900 mt-2">
                      ₹{selectedStaff.monthlySalary.toLocaleString()}
                      <span className="text-xs text-neutral-500 font-normal"> / month</span>
                    </p>
                  </div>

                  <div className="bg-white p-5 rounded-xl border border-neutral-200 shadow-[6px_6px_16px_#e5e7eb,-6px_-6px_16px_#ffffff]">
                    <p className="text-[10px] font-mono uppercase font-black tracking-widest text-neutral-400">
                      Total Advance Active
                    </p>
                    <p className="text-2xl font-black tracking-tight text-amber-600 mt-2">
                      ₹{selectedStaff.totalAdvanceGiven.toLocaleString()}
                    </p>
                  </div>

                  <div className="bg-white p-5 rounded-xl border border-neutral-200 shadow-[6px_6px_16px_#e5e7eb,-6px_-6px_16px_#ffffff]">
                    <p className="text-[10px] font-mono uppercase font-black tracking-widest text-neutral-400">
                      Payment Pending Due
                    </p>
                    <p className="text-2xl font-black tracking-tight text-rose-600 mt-2">
                      ₹{selectedStaff.totalPendingDue.toLocaleString()}
                    </p>
                  </div>
                </div>

                {/* Ledger Table */}
                <div className="bg-white rounded-xl border border-neutral-200 shadow-[6px_6px_16px_#e5e7eb,-6px_-6px_16px_#ffffff] overflow-hidden">
                  <div className="p-4 border-b border-neutral-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-neutral-50">
                    <div>
                      <h3 className="text-xs font-mono font-black uppercase tracking-wider text-neutral-900">
                        Transaction History & Audit Trail
                      </h3>
                      <p className="text-[11px] text-neutral-500 font-mono">
                        Staff: {selectedStaff.staffName} ({selectedStaff.staffMobile})
                      </p>
                    </div>

                    <button
                      onClick={() => setShowPaymentModal(true)}
                      className="px-4 py-2 rounded-lg font-black text-xs uppercase tracking-wider bg-neutral-900 text-white hover:bg-neutral-800 transition"
                    >
                      + Record Payment
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-medium">
                      <thead className="bg-white border-b border-neutral-200 text-neutral-400 font-mono text-[10px] uppercase">
                        <tr>
                          <th className="p-3.5">Date</th>
                          <th className="p-3.5">Type</th>
                          <th className="p-3.5">Amount</th>
                          <th className="p-3.5">Payment Details</th>
                          <th className="p-3.5">Remarks</th>
                          <th className="p-3.5">Logged By</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {transactions.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="p-8 text-center text-neutral-400 font-mono text-xs">
                              NO TRANSACTIONS RECORDED YET.
                            </td>
                          </tr>
                        ) : (
                          transactions.map((tx) => (
                            <tr key={tx.id} className="hover:bg-neutral-50/80 transition font-mono">
                              <td className="p-3.5 text-neutral-900 font-bold whitespace-nowrap">{tx.date}</td>
                              <td className="p-3.5 whitespace-nowrap">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-black border ${
                                    tx.type === "ADVANCE_PAYMENT"
                                      ? "bg-amber-50 text-amber-800 border-amber-300"
                                      : tx.type === "SALARY_CREDIT"
                                      ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                                      : "bg-blue-50 text-blue-800 border-blue-300"
                                  }`}
                                >
                                  {tx.type}
                                </span>
                              </td>
                              <td className="p-3.5 font-black text-sm whitespace-nowrap text-neutral-950">
                                ₹{tx.amount.toLocaleString()}
                              </td>
                              <td className="p-3.5 max-w-xs text-[11px] leading-tight">
                                <span className="font-black text-neutral-900">{tx.paymentDetails.mode}</span>
                                {tx.paymentDetails.mode === "UPI" && (
                                  <div className="text-neutral-500">
                                    ID: {tx.paymentDetails.upiId || "—"} | Mob: {tx.paymentDetails.mobileNumber || "—"}
                                  </div>
                                )}
                                {tx.paymentDetails.mode === "Bank Transfer - IMPS/RTGS" && (
                                  <div className="text-neutral-500">
                                    Bank: {tx.paymentDetails.toBankName} | A/C: {tx.paymentDetails.toAccountNumber} | Txn: {tx.paymentDetails.transactionId}
                                  </div>
                                )}
                                {tx.paymentDetails.mode === "Cash" && (
                                  <div className="text-neutral-500">Desc: {tx.paymentDetails.cashDescription}</div>
                                )}
                                {tx.paymentDetails.fromAccount && (
                                  <div className="text-[10px] text-neutral-400 italic">From: {tx.paymentDetails.fromAccount}</div>
                                )}
                              </td>
                              <td className="p-3.5 text-neutral-600 max-w-xs text-[11px]">{tx.remarks || "—"}</td>
                              <td className="p-3.5 text-[10px] text-neutral-400 whitespace-nowrap">{tx.createdByEmail}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-white rounded-xl p-12 text-center border border-neutral-200 shadow-sm text-neutral-400 font-mono text-xs">
                SELECT OR CREATE A STAFF ACCOUNT TO VIEW THE LEDGER.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal 1: Open Staff Account */}
      {showOpenAccountModal && (
        <div className="fixed inset-0 bg-neutral-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 border border-neutral-300 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-neutral-200 pb-3">
              <h2 className="text-base font-black uppercase text-neutral-950 font-mono">
                Open Staff Credit Account
              </h2>
              <button onClick={() => setShowOpenAccountModal(false)} className="text-neutral-400 hover:text-black font-black">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateStaffAccount} className="space-y-4 text-xs font-mono">
              <div>
                <label className="block font-black text-neutral-800 mb-1 uppercase">Choose Staff (From Team) *</label>
                <select
                  required
                  value={selectedUserUid}
                  onChange={(e) => setSelectedUserUid(e.target.value)}
                  className="w-full border border-neutral-300 p-2.5 rounded-lg bg-neutral-50 focus:bg-white text-neutral-950 font-bold outline-none"
                >
                  <option value="">-- Choose Staff Member --</option>
                  {unassignedStaffUsers.map((u) => (
                    <option key={u.uid} value={u.uid}>
                      {u.displayName || u.email} ({u.role?.toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-black text-neutral-800 mb-1 uppercase">Agreed Monthly Salary (₹) *</label>
                <input
                  type="number"
                  required
                  min="0"
                  placeholder="e.g. 45000"
                  value={monthlySalaryInput}
                  onChange={(e) => setMonthlySalaryInput(Number(e.target.value))}
                  className="w-full border border-neutral-300 p-2.5 rounded-lg bg-neutral-50 focus:bg-white text-neutral-950 font-bold outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-200 font-sans">
                <button
                  type="button"
                  onClick={() => setShowOpenAccountModal(false)}
                  className="px-4 py-2 border border-neutral-300 font-bold rounded-lg text-xs hover:bg-neutral-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-neutral-950 text-white font-black rounded-lg text-xs hover:bg-neutral-800 transition"
                >
                  Establish Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Record Payment */}
      {showPaymentModal && selectedStaff && (
        <div className="fixed inset-0 bg-neutral-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 border border-neutral-300 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-neutral-200 pb-3">
              <div>
                <h2 className="text-base font-black uppercase text-neutral-950 font-mono">
                  Record Staff Transaction
                </h2>
                <p className="text-[11px] text-neutral-500 font-mono">Beneficiary: {selectedStaff.staffName}</p>
              </div>
              <button onClick={() => setShowPaymentModal(false)} className="text-neutral-400 hover:text-black font-black">
                ✕
              </button>
            </div>

            <form onSubmit={handleRecordTransaction} className="space-y-4 text-xs font-mono">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-black text-neutral-800 mb-1 uppercase">Transaction Type *</label>
                  <select
                    value={txnType}
                    onChange={(e) => setTxnType(e.target.value as any)}
                    className="w-full border border-neutral-300 p-2.5 rounded-lg bg-neutral-50 focus:bg-white text-neutral-950 font-bold outline-none"
                  >
                    <option value="ADVANCE_PAYMENT">Advance Payment</option>
                    <option value="SALARY_CREDIT">Salary Payment</option>
                    <option value="SETTLEMENT_PAYMENT">Due Settlement</option>
                  </select>
                </div>

                <div>
                  <label className="block font-black text-neutral-800 mb-1 uppercase">Date *</label>
                  <input
                    type="date"
                    required
                    value={txnDate}
                    onChange={(e) => setTxnDate(e.target.value)}
                    className="w-full border border-neutral-300 p-2.5 rounded-lg bg-neutral-50 focus:bg-white text-neutral-950 font-bold outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-black text-neutral-800 mb-1 uppercase">Amount (₹) *</label>
                <input
                  type="number"
                  required
                  min="1"
                  placeholder="e.g. 15000"
                  value={txnAmount}
                  onChange={(e) => setTxnAmount(Number(e.target.value))}
                  className="w-full border border-neutral-300 p-2.5 rounded-lg bg-neutral-50 focus:bg-white text-neutral-950 font-bold outline-none text-sm"
                />
              </div>

              <div>
                <label className="block font-black text-neutral-800 mb-1 uppercase">Mode of Payment *</label>
                <select
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
                  className="w-full border border-neutral-300 p-2.5 rounded-lg bg-neutral-50 focus:bg-white text-neutral-950 font-bold outline-none"
                >
                  <option value="Cash">1 - Cash</option>
                  <option value="UPI">2 - UPI</option>
                  <option value="Bank Transfer - IMPS/RTGS">3 - Bank Transfer - IMPS/RTGS</option>
                </select>
              </div>

              <div>
                <label className="block font-black text-neutral-800 mb-1 uppercase">Debited From Company A/C</label>
                <input
                  type="text"
                  placeholder="e.g. HDFC Current #00129"
                  value={fromAccount}
                  onChange={(e) => setFromAccount(e.target.value)}
                  className="w-full border border-neutral-300 p-2.5 rounded-lg bg-neutral-50 focus:bg-white text-neutral-950 outline-none"
                />
              </div>

              {/* Conditional UPI */}
              {paymentMode === "UPI" && (
                <div className="bg-neutral-50 p-3 rounded-xl border border-neutral-200 space-y-3">
                  <span className="block text-[10px] font-black uppercase text-neutral-500">UPI Specifics</span>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-neutral-700 mb-1">Target UPI ID</label>
                      <input
                        placeholder="staff@okhdfcbank"
                        value={upiId}
                        onChange={(e) => setUpiId(e.target.value)}
                        className="w-full border border-neutral-300 p-2 rounded bg-white text-neutral-950 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-neutral-700 mb-1">Mobile No</label>
                      <input
                        placeholder="Mobile No (or Friend's)"
                        value={mobileNumber}
                        onChange={(e) => setMobileNumber(e.target.value)}
                        className="w-full border border-neutral-300 p-2 rounded bg-white text-neutral-950 outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Conditional Bank Transfer */}
              {paymentMode === "Bank Transfer - IMPS/RTGS" && (
                <div className="bg-neutral-50 p-3 rounded-xl border border-neutral-200 space-y-3">
                  <span className="block text-[10px] font-black uppercase text-neutral-500">Bank Details</span>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-neutral-700 mb-1">Bank Name *</label>
                      <input
                        required
                        placeholder="e.g. ICICI Bank"
                        value={toBankName}
                        onChange={(e) => setToBankName(e.target.value)}
                        className="w-full border border-neutral-300 p-2 rounded bg-white text-neutral-950 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-neutral-700 mb-1">A/C Number *</label>
                      <input
                        required
                        placeholder="Account Number"
                        value={toAccountNumber}
                        onChange={(e) => setToAccountNumber(e.target.value)}
                        className="w-full border border-neutral-300 p-2 rounded bg-white text-neutral-950 outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-neutral-700 mb-1">UTR / Transaction ID *</label>
                    <input
                      required
                      placeholder="e.g. UTR123456789"
                      value={transactionId}
                      onChange={(e) => setTransactionId(e.target.value)}
                      className="w-full border border-neutral-300 p-2 rounded bg-white text-neutral-950 outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Conditional Cash */}
              {paymentMode === "Cash" && (
                <div>
                  <label className="block font-black text-neutral-800 mb-1 uppercase">Description of Cash *</label>
                  <textarea
                    required
                    rows={2}
                    placeholder="e.g. Physical cash handed over to member directly"
                    value={cashDescription}
                    onChange={(e) => setCashDescription(e.target.value)}
                    className="w-full border border-neutral-300 p-2.5 rounded-lg bg-neutral-50 focus:bg-white text-neutral-950 outline-none"
                  />
                </div>
              )}

              <div>
                <label className="block font-black text-neutral-800 mb-1 uppercase">Remarks</label>
                <input
                  type="text"
                  placeholder="Optional audit trail note..."
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  className="w-full border border-neutral-300 p-2.5 rounded-lg bg-neutral-50 focus:bg-white text-neutral-950 outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-200 font-sans">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="px-4 py-2 border border-neutral-300 font-bold rounded-lg text-xs hover:bg-neutral-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-neutral-950 text-white font-black rounded-lg text-xs hover:bg-neutral-800 transition"
                >
                  Post Transaction
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}