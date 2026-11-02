"use client";

import React, { useState, useEffect, useRef } from "react";
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

// Helper to format date as "YYYY-MM"
const getYearMonthKey = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
};

export default function StaffAccountingPage(): React.ReactElement {
  const { user, role, isSuperAdmin, loading } = useAuth();
  const router = useRouter();

  // Hardcoded Read-Only Auditor / Viewer
  const READ_ONLY_EMAIL = "itsmanisharora@gmail.com";
  const isReadOnlyViewer =
    user?.email?.toLowerCase().trim() === READ_ONLY_EMAIL.toLowerCase().trim();

  // Access Guard
  const isAccountant = (role as any) === "accountant";
  const canAccess =
    isSuperAdmin || isAccountant || role === "admin" || isReadOnlyViewer;

  // Management Permission (Read-only viewer cannot create, edit, or post payments)
  const canManageLedger =
    !isReadOnlyViewer && (isSuperAdmin || isAccountant || role === "admin");

  const [availableUsers, setAvailableUsers] = useState<any[]>([]);
  const [staffAccounts, setStaffAccounts] = useState<StaffAccount[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<StaffAccount | null>(null);
  const [transactions, setTransactions] = useState<StaffTransaction[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // Concurrency lock for monthly auto-accrual
  const isSyncingRef = useRef(false);

  // Modals
  const [showOpenAccountModal, setShowOpenAccountModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showEditStaffModal, setShowEditStaffModal] = useState(false);

  // New Account State
  const [selectedUserUid, setSelectedUserUid] = useState("");
  const [monthlySalaryInput, setMonthlySalaryInput] = useState<number | "">("");
  const [joiningDateInput, setJoiningDateInput] = useState(
    new Date().toISOString().split("T")[0]
  );

  // Edit Staff State (Super Admin Only)
  const [editMonthlySalary, setEditMonthlySalary] = useState<number | "">("");
  const [editJoiningDate, setEditJoiningDate] = useState("");

  // Payment Form State
  const [txnType, setTxnType] = useState<
    "SALARY_CREDIT" | "ADVANCE_PAYMENT" | "SETTLEMENT_PAYMENT"
  >("ADVANCE_PAYMENT");
  const [txnAmount, setTxnAmount] = useState<number | "">("");
  const [txnDate, setTxnDate] = useState(new Date().toISOString().split("T")[0]);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>(
    "Bank Transfer - IMPS/RTGS"
  );
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

  // Automated monthly salary accrual reconciliation with duplicate prevention
  const processMonthlySalaryAccrual = async (acc: StaffAccount): Promise<StaffAccount> => {
    // Only management accounts perform accrual writes to DB
    if (!canManageLedger) return acc;

    const currentMonthKey = getYearMonthKey(new Date());
    const startMonthKey =
      acc.lastSalaryAccruedMonth ||
      (acc.joiningDate ? acc.joiningDate.slice(0, 7) : acc.createdAt.slice(0, 7));

    if (startMonthKey >= currentMonthKey) {
      return acc;
    }

    const [startYear, startMonth] = startMonthKey.split("-").map(Number);
    const [currYear, currMonth] = currentMonthKey.split("-").map(Number);

    let monthsElapsed = 0;
    let y = startYear;
    let m = startMonth;

    while (y < currYear || (y === currYear && m < currMonth)) {
      m++;
      if (m > 12) {
        m = 1;
        y++;
      }
      monthsElapsed++;
    }

    if (monthsElapsed > 0) {
      const addedSalary = monthsElapsed * acc.monthlySalary;
      const updatedDue = (acc.totalPendingDue || 0) + addedSalary;

      const updatedFields = {
        totalPendingDue: updatedDue,
        lastSalaryAccruedMonth: currentMonthKey,
        updatedAt: new Date().toISOString(),
      };

      try {
        await updateDoc(
          doc(db, "accounting_staff_accounts", acc.staffUid),
          updatedFields
        );

        // Deterministic document ID ensures duplicate executions overwrite safely
        const deterministicTxnId = `accrual_${acc.staffUid}_${currentMonthKey}`;
        await setDoc(doc(db, "accounting_staff_transactions", deterministicTxnId), {
          staffUid: acc.staffUid,
          type: "MONTHLY_SALARY_ACCRUAL",
          amount: addedSalary,
          date: new Date().toISOString().split("T")[0],
          paymentDetails: { mode: "Automated System Accrual" as any },
          remarks: `Auto-accrued salary for ${monthsElapsed} month(s) up to ${currentMonthKey}`,
          createdAt: new Date().toISOString(),
          createdByUid: "SYSTEM",
          createdByEmail: "system-auto-accrual@erp",
        });

        return { ...acc, ...updatedFields };
      } catch (e) {
        console.error("Failed to auto-accrue salary for staff", acc.staffUid, e);
      }
    }

    return acc;
  };

  // Fetch staff users and created accounts
  const loadInitialData = async () => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;

    try {
      setLoadingData(true);

      const userSnap = await getDocs(collection(db, "users"));
      const usersList = userSnap.docs.map((d) => ({ uid: d.id, ...d.data() }));
      setAvailableUsers(usersList);

      const accSnap = await getDocs(collection(db, "accounting_staff_accounts"));
      const rawAccountsList = accSnap.docs.map(
        (d) => ({ id: d.id, ...d.data() } as StaffAccount)
      );

      const processedAccounts: StaffAccount[] = [];
      for (const account of rawAccountsList) {
        const synced = await processMonthlySalaryAccrual(account);
        processedAccounts.push(synced);
      }

      setStaffAccounts(processedAccounts);

      if (processedAccounts.length > 0) {
        setSelectedStaff((prev) => {
          if (!prev) return processedAccounts[0];
          const refreshed = processedAccounts.find((a) => a.staffUid === prev.staffUid);
          return refreshed || processedAccounts[0];
        });
      }
    } catch (err) {
      console.error("Error fetching staff accounting:", err);
    } finally {
      setLoadingData(false);
      isSyncingRef.current = false;
    }
  };

  useEffect(() => {
    if (user && canAccess) {
      loadInitialData();
    }
  }, [user, canAccess]);

  // Load transactions for selected staff
  const fetchTransactions = async (staffUid: string) => {
    try {
      const q = query(
        collection(db, "accounting_staff_transactions"),
        where("staffUid", "==", staffUid)
      );
      const snap = await getDocs(q);

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
  }, [selectedStaff?.staffUid]);

  // Download Consolidated PDF for All Staff Accounts
  const handleDownloadAllStaffLedgersPdf = async () => {
    try {
      setIsGeneratingPdf(true);

      // Dynamically import jsPDF and autoTable for safe client-side execution
      const { default: jsPDF } = await import("jspdf");
      const { default: autoTable } = await import("jspdf-autotable");

      // Fetch all transactions across all staff
      const txSnap = await getDocs(collection(db, "accounting_staff_transactions"));
      const allTxList = txSnap.docs.map(
        (d) => ({ id: d.id, ...d.data() } as StaffTransaction)
      );

      const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });

      // Page Title & Header
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("BRAJWAL ERP — CONSOLIDATED STAFF LEDGER", 40, 45);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(100);
      doc.text(
        `Generated: ${new Date().toLocaleString()} | Requested by: ${user?.email || "User"}`,
        40,
        60
      );
      doc.text(
        `Total Active Staff Accounts: ${staffAccounts.length}`,
        40,
        72
      );

      // Section 1: Staff Summary Table
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(30);
      doc.text("1. Overall Staff Accounts Summary", 40, 95);

      const summaryTableData = staffAccounts.map((acc, index) => [
        index + 1,
        acc.staffName,
        acc.staffMobile || "—",
        acc.joiningDate || "—",
        `Rs. ${acc.monthlySalary.toLocaleString()}`,
        `Rs. ${acc.totalAdvanceGiven.toLocaleString()}`,
        `Rs. ${acc.totalPendingDue.toLocaleString()}`,
      ]);

      autoTable(doc, {
        startY: 105,
        head: [
          [
            "#",
            "Staff Member",
            "Mobile",
            "DOJ",
            "Salary/Mo",
            "Total Advance",
            "Pending Due",
          ],
        ],
        body: summaryTableData,
        theme: "striped",
        headStyles: { fillColor: [25, 25, 25], fontSize: 8, fontStyle: "bold" },
        bodyStyles: { fontSize: 8 },
        styles: { cellPadding: 4 },
      });

      // Section 2: Detailed Individual Ledgers
      let currentY = (doc as any).lastAutoTable.finalY + 30;

      for (const acc of staffAccounts) {
        // Add new page if space is low
        if (currentY > 700) {
          doc.addPage();
          currentY = 40;
        }

        // Header for this staff member
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(20);
        doc.text(`Staff Ledger: ${acc.staffName}`, 40, currentY);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(90);
        doc.text(
          `Email: ${acc.staffEmail} | Phone: ${acc.staffMobile || "—"} | Joined: ${
            acc.joiningDate || "—"
          } | Salary: Rs. ${acc.monthlySalary.toLocaleString()}/mo | Advance: Rs. ${acc.totalAdvanceGiven.toLocaleString()} | Due: Rs. ${acc.totalPendingDue.toLocaleString()}`,
          40,
          currentY + 12
        );

        // Filter and sort transactions for this staff
        const staffTx = allTxList
          .filter((t) => t.staffUid === acc.staffUid)
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        const txTableData =
          staffTx.length === 0
            ? [["—", "No transactions found", "—", "—", "—"]]
            : staffTx.map((tx) => {
                let modeDetail = tx.paymentDetails?.mode || "—";
                if (tx.paymentDetails?.mode === "UPI" && tx.paymentDetails.upiId) {
                  modeDetail += ` (${tx.paymentDetails.upiId})`;
                } else if (
                  tx.paymentDetails?.mode === "Bank Transfer - IMPS/RTGS" &&
                  tx.paymentDetails.toAccountNumber
                ) {
                  modeDetail += ` (A/C: ${tx.paymentDetails.toAccountNumber})`;
                }
                return [
                  tx.date,
                  tx.type,
                  `Rs. ${Number(tx.amount).toLocaleString()}`,
                  modeDetail,
                  tx.remarks || "—",
                ];
              });

        autoTable(doc, {
          startY: currentY + 20,
          head: [["Date", "Type", "Amount", "Mode / Details", "Remarks"]],
          body: txTableData,
          theme: "plain",
          headStyles: {
            fillColor: [240, 240, 240],
            textColor: [40, 40, 40],
            fontSize: 7.5,
            fontStyle: "bold",
          },
          bodyStyles: { fontSize: 7.5 },
          styles: { cellPadding: 3.5 },
        });

        currentY = (doc as any).lastAutoTable.finalY + 25;
      }

      // Save output
      const dateStr = new Date().toISOString().split("T")[0];
      doc.save(`All_Staff_Ledgers_Statement_${dateStr}.pdf`);
    } catch (err: any) {
      console.error("PDF generation failed:", err);
      alert("Failed to export PDF: " + err.message);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Open New Account
  const handleCreateStaffAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageLedger) return;
    if (!user || !selectedUserUid || !monthlySalaryInput) return;

    const matchedUser = availableUsers.find((u) => u.uid === selectedUserUid);
    if (!matchedUser) return;

    try {
      const selectedJoiningDate =
        joiningDateInput || new Date().toISOString().split("T")[0];
      const initialMonthKey = selectedJoiningDate.slice(0, 7);

      const newAccount: StaffAccount = {
        id: matchedUser.uid,
        staffUid: matchedUser.uid,
        staffName: matchedUser.displayName || matchedUser.email,
        staffEmail: matchedUser.email,
        staffMobile: matchedUser.mobile || "—",
        monthlySalary: Number(monthlySalaryInput),
        totalAdvanceGiven: 0,
        totalPendingDue: Number(monthlySalaryInput),
        joiningDate: selectedJoiningDate,
        lastSalaryAccruedMonth: initialMonthKey,
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
        notes: `Created salary account at ₹${monthlySalaryInput}/mo. Joining Date: ${selectedJoiningDate}`,
      });

      setShowOpenAccountModal(false);
      setSelectedUserUid("");
      setMonthlySalaryInput("");
      setJoiningDateInput(new Date().toISOString().split("T")[0]);
      await loadInitialData();
      setSelectedStaff(newAccount);
      alert("✅ Staff Account successfully established.");
    } catch (err: any) {
      console.error(err);
      alert("Failed to initialize account: " + err.message);
    }
  };

  // Open Edit Modal for Super Admin
  const handleOpenEditModal = () => {
    if (!selectedStaff || !isSuperAdmin || isReadOnlyViewer) return;
    setEditMonthlySalary(selectedStaff.monthlySalary);
    setEditJoiningDate(
      selectedStaff.joiningDate || selectedStaff.createdAt.split("T")[0]
    );
    setShowEditStaffModal(true);
  };

  // Submit Edit Staff Account (Super Admin Only)
  const handleUpdateStaffAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin || isReadOnlyViewer) {
      alert("Unauthorized: Only Super Admins can modify staff account parameters.");
      return;
    }
    if (!selectedStaff || !editMonthlySalary || !editJoiningDate) return;

    try {
      const updatedFields: Partial<StaffAccount> = {
        monthlySalary: Number(editMonthlySalary),
        joiningDate: editJoiningDate,
        updatedAt: new Date().toISOString(),
      };

      await updateDoc(
        doc(db, "accounting_staff_accounts", selectedStaff.staffUid),
        updatedFields
      );

      await recordAuditLog(user, {
        module: "STAFF_LEDGER",
        action: "UPDATE",
        targetId: selectedStaff.staffUid,
        targetName: selectedStaff.staffName,
        previousData: {
          monthlySalary: selectedStaff.monthlySalary,
          joiningDate: selectedStaff.joiningDate,
        },
        newData: updatedFields,
        notes: `Super Admin modified account parameters: Salary: ₹${editMonthlySalary}, DOJ: ${editJoiningDate}`,
      });

      const updatedAccount = { ...selectedStaff, ...updatedFields };
      setSelectedStaff(updatedAccount);
      setStaffAccounts((prev) =>
        prev.map((acc) =>
          acc.staffUid === updatedAccount.staffUid ? updatedAccount : acc
        )
      );

      setShowEditStaffModal(false);
      alert("✅ Staff parameters updated successfully.");
    } catch (err: any) {
      console.error("Failed to update staff parameters:", err);
      alert("Update failed: " + err.message);
    }
  };

  // Submit Payment/Ledger Transaction
  const handleRecordTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageLedger) return;
    if (!user || !selectedStaff || !txnAmount) return;

    const parsedAmount = Number(txnAmount);

    const paymentDetails: PaymentDetails = { mode: paymentMode };

    if (fromAccount.trim()) {
      paymentDetails.fromAccount = fromAccount.trim();
    }

    if (paymentMode === "UPI") {
      if (upiId.trim()) paymentDetails.upiId = upiId.trim();
      if (mobileNumber.trim()) paymentDetails.mobileNumber = mobileNumber.trim();
    } else if (paymentMode === "Bank Transfer - IMPS/RTGS") {
      if (toBankName.trim()) paymentDetails.toBankName = toBankName.trim();
      if (toAccountNumber.trim())
        paymentDetails.toAccountNumber = toAccountNumber.trim();
      if (transactionId.trim()) paymentDetails.transactionId = transactionId.trim();
    } else if (paymentMode === "Cash") {
      if (cashDescription.trim())
        paymentDetails.cashDescription = cashDescription.trim();
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

      await updateDoc(
        doc(db, "accounting_staff_accounts", selectedStaff.staffUid),
        updatedFields
      );

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

      setShowPaymentModal(false);
      setTxnAmount("");
      setRemarks("");
      setUpiId("");
      setMobileNumber("");
      setToBankName("");
      setToAccountNumber("");
      setTransactionId("");
      setCashDescription("");

      const refreshed = {
        ...selectedStaff,
        ...updatedFields,
      };
      setSelectedStaff(refreshed);
      setStaffAccounts((prev) =>
        prev.map((acc) => (acc.staffUid === refreshed.staffUid ? refreshed : acc))
      );
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
              {isReadOnlyViewer && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-bold border border-blue-200">
                  AUDITOR / READ-ONLY
                </span>
              )}
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-neutral-950 mt-1">
              Staff Credit Accounts & Salary Ledger
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {/* Download PDF Button */}
            <button
              onClick={handleDownloadAllStaffLedgersPdf}
              disabled={isGeneratingPdf || staffAccounts.length === 0}
              className="px-4 py-2.5 rounded-lg font-black text-xs uppercase tracking-wider bg-white border border-neutral-300 text-neutral-800 hover:bg-neutral-100 transition shadow-sm flex items-center gap-2 disabled:opacity-50"
            >
              <span>{isGeneratingPdf ? "⏳ Generating..." : "📄"}</span>
              <span>Download All Staff Ledgers (PDF)</span>
            </button>

            {/* Open Account Button (Hidden for Read-Only Viewer) */}
            {canManageLedger && (
              <button
                onClick={() => setShowOpenAccountModal(true)}
                className="px-5 py-2.5 rounded-lg font-black text-xs uppercase tracking-wider bg-neutral-900 text-white hover:bg-neutral-800 transition shadow-[4px_4px_10px_rgba(0,0,0,0.15)] active:translate-y-0.5"
              >
                + Open Staff Account
              </button>
            )}
          </div>
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
                          <p className="font-black text-sm tracking-tight">
                            {acc.staffName}
                          </p>
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
                        <p
                          className={`text-xs mt-1 ${
                            isSelected ? "text-neutral-400" : "text-neutral-500"
                          }`}
                        >
                          {acc.staffEmail}
                        </p>
                        {acc.joiningDate && (
                          <p
                            className={`text-[10px] font-mono mt-0.5 ${
                              isSelected ? "text-neutral-400" : "text-neutral-400"
                            }`}
                          >
                            Joined: {acc.joiningDate}
                          </p>
                        )}
                        <div className="mt-3 pt-2 border-t border-neutral-200/20 flex justify-between text-[11px] font-mono">
                          <span>
                            Advance:{" "}
                            <strong className="text-amber-500">
                              ₹{acc.totalAdvanceGiven}
                            </strong>
                          </span>
                          <span>
                            Due:{" "}
                            <strong className="text-rose-500">
                              ₹{acc.totalPendingDue}
                            </strong>
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
                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white p-5 rounded-xl border border-neutral-200 shadow-[6px_6px_16px_#e5e7eb,-6px_-6px_16px_#ffffff] relative group">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-mono uppercase font-black tracking-widest text-neutral-400">
                        Agreed Salary
                      </p>
                      {/* Super Admin Edit (Disabled for Read-Only Viewer) */}
                      {isSuperAdmin && !isReadOnlyViewer && (
                        <button
                          onClick={handleOpenEditModal}
                          title="Super Admin: Edit Account Parameters"
                          className="text-[11px] font-mono font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2 py-0.5 rounded transition"
                        >
                          ✎ Edit
                        </button>
                      )}
                    </div>
                    <p className="text-2xl font-black tracking-tight text-neutral-900 mt-2">
                      ₹{selectedStaff.monthlySalary.toLocaleString()}
                      <span className="text-xs text-neutral-500 font-normal">
                        {" "}
                        / month
                      </span>
                    </p>
                    <p className="text-[11px] font-mono text-neutral-400 mt-1">
                      Joined:{" "}
                      <span className="text-neutral-800 font-bold">
                        {selectedStaff.joiningDate || "—"}
                      </span>
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

                    {/* Record Payment Button (Hidden for Read-Only Viewer) */}
                    {canManageLedger && (
                      <button
                        onClick={() => setShowPaymentModal(true)}
                        className="px-4 py-2 rounded-lg font-black text-xs uppercase tracking-wider bg-neutral-900 text-white hover:bg-neutral-800 transition"
                      >
                        + Record Payment
                      </button>
                    )}
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
                            <td
                              colSpan={6}
                              className="p-8 text-center text-neutral-400 font-mono text-xs"
                            >
                              NO TRANSACTIONS RECORDED YET.
                            </td>
                          </tr>
                        ) : (
                          transactions.map((tx) => (
                            <tr
                              key={tx.id}
                              className="hover:bg-neutral-50/80 transition font-mono"
                            >
                              <td className="p-3.5 text-neutral-900 font-bold whitespace-nowrap">
                                {tx.date}
                              </td>
                              <td className="p-3.5 whitespace-nowrap">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-black border ${
                                    tx.type === "ADVANCE_PAYMENT"
                                      ? "bg-amber-50 text-amber-800 border-amber-300"
                                      : tx.type === "SALARY_CREDIT"
                                      ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                                      : tx.type === ("MONTHLY_SALARY_ACCRUAL" as any)
                                      ? "bg-purple-50 text-purple-800 border-purple-300"
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
                                <span className="font-black text-neutral-900">
                                  {tx.paymentDetails.mode}
                                </span>
                                {tx.paymentDetails.mode === "UPI" && (
                                  <div className="text-neutral-500">
                                    ID: {tx.paymentDetails.upiId || "—"} | Mob:{" "}
                                    {tx.paymentDetails.mobileNumber || "—"}
                                  </div>
                                )}
                                {tx.paymentDetails.mode ===
                                  "Bank Transfer - IMPS/RTGS" && (
                                  <div className="text-neutral-500">
                                    Bank: {tx.paymentDetails.toBankName} | A/C:{" "}
                                    {tx.paymentDetails.toAccountNumber} | Txn:{" "}
                                    {tx.paymentDetails.transactionId}
                                  </div>
                                )}
                                {tx.paymentDetails.mode === "Cash" && (
                                  <div className="text-neutral-500">
                                    Desc: {tx.paymentDetails.cashDescription}
                                  </div>
                                )}
                                {tx.paymentDetails.fromAccount && (
                                  <div className="text-[10px] text-neutral-400 italic">
                                    From: {tx.paymentDetails.fromAccount}
                                  </div>
                                )}
                              </td>
                              <td className="p-3.5 text-neutral-600 max-w-xs text-[11px]">
                                {tx.remarks || "—"}
                              </td>
                              <td className="p-3.5 text-[10px] text-neutral-400 whitespace-nowrap">
                                {tx.createdByEmail}
                              </td>
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
      {showOpenAccountModal && canManageLedger && (
        <div className="fixed inset-0 bg-neutral-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 border border-neutral-300 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-neutral-200 pb-3">
              <h2 className="text-base font-black uppercase text-neutral-950 font-mono">
                Open Staff Credit Account
              </h2>
              <button
                onClick={() => setShowOpenAccountModal(false)}
                className="text-neutral-400 hover:text-black font-black"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={handleCreateStaffAccount}
              className="space-y-4 text-xs font-mono"
            >
              <div>
                <label className="block font-black text-neutral-800 mb-1 uppercase">
                  Choose Staff (From Team) *
                </label>
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
                <label className="block font-black text-neutral-800 mb-1 uppercase">
                  Date of Joining *
                </label>
                <input
                  type="date"
                  required
                  value={joiningDateInput}
                  onChange={(e) => setJoiningDateInput(e.target.value)}
                  className="w-full border border-neutral-300 p-2.5 rounded-lg bg-neutral-50 focus:bg-white text-neutral-950 font-bold outline-none"
                />
              </div>

              <div>
                <label className="block font-black text-neutral-800 mb-1 uppercase">
                  Agreed Monthly Salary (₹) *
                </label>
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

      {/* Modal 2: Edit Staff Account (Super Admin Only) */}
      {showEditStaffModal && isSuperAdmin && !isReadOnlyViewer && selectedStaff && (
        <div className="fixed inset-0 bg-neutral-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 border border-neutral-300 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-neutral-200 pb-3">
              <div>
                <h2 className="text-base font-black uppercase text-neutral-950 font-mono">
                  Edit Staff Parameters
                </h2>
                <p className="text-[11px] text-neutral-500 font-mono">
                  Super Admin Override • {selectedStaff.staffName}
                </p>
              </div>
              <button
                onClick={() => setShowEditStaffModal(false)}
                className="text-neutral-400 hover:text-black font-black"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={handleUpdateStaffAccount}
              className="space-y-4 text-xs font-mono"
            >
              <div>
                <label className="block font-black text-neutral-800 mb-1 uppercase">
                  Agreed Monthly Salary (₹) *
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  value={editMonthlySalary}
                  onChange={(e) => setEditMonthlySalary(Number(e.target.value))}
                  className="w-full border border-neutral-300 p-2.5 rounded-lg bg-neutral-50 focus:bg-white text-neutral-950 font-bold outline-none"
                />
              </div>

              <div>
                <label className="block font-black text-neutral-800 mb-1 uppercase">
                  Date of Joining *
                </label>
                <input
                  type="date"
                  required
                  value={editJoiningDate}
                  onChange={(e) => setEditJoiningDate(e.target.value)}
                  className="w-full border border-neutral-300 p-2.5 rounded-lg bg-neutral-50 focus:bg-white text-neutral-950 font-bold outline-none"
                />
              </div>

              <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg text-[11px] text-amber-800">
                ⚠️ Modifying salary or joining date will be recorded in the security audit trail.
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-200 font-sans">
                <button
                  type="button"
                  onClick={() => setShowEditStaffModal(false)}
                  className="px-4 py-2 border border-neutral-300 font-bold rounded-lg text-xs hover:bg-neutral-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-neutral-950 text-white font-black rounded-lg text-xs hover:bg-neutral-800 transition"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 3: Record Payment */}
      {showPaymentModal && canManageLedger && selectedStaff && (
        <div className="fixed inset-0 bg-neutral-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 border border-neutral-300 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-neutral-200 pb-3">
              <div>
                <h2 className="text-base font-black uppercase text-neutral-950 font-mono">
                  Record Staff Transaction
                </h2>
                <p className="text-[11px] text-neutral-500 font-mono">
                  Beneficiary: {selectedStaff.staffName}
                </p>
              </div>
              <button
                onClick={() => setShowPaymentModal(false)}
                className="text-neutral-400 hover:text-black font-black"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={handleRecordTransaction}
              className="space-y-4 text-xs font-mono"
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-black text-neutral-800 mb-1 uppercase">
                    Transaction Type *
                  </label>
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
                  <label className="block font-black text-neutral-800 mb-1 uppercase">
                    Date *
                  </label>
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
                <label className="block font-black text-neutral-800 mb-1 uppercase">
                  Amount (₹) *
                </label>
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
                <label className="block font-black text-neutral-800 mb-1 uppercase">
                  Mode of Payment *
                </label>
                <select
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
                  className="w-full border border-neutral-300 p-2.5 rounded-lg bg-neutral-50 focus:bg-white text-neutral-950 font-bold outline-none"
                >
                  <option value="Cash">1 - Cash</option>
                  <option value="UPI">2 - UPI</option>
                  <option value="Bank Transfer - IMPS/RTGS">
                    3 - Bank Transfer - IMPS/RTGS
                  </option>
                </select>
              </div>

              <div>
                <label className="block font-black text-neutral-800 mb-1 uppercase">
                  Debited From Company A/C
                </label>
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
                  <span className="block text-[10px] font-black uppercase text-neutral-500">
                    UPI Specifics
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-neutral-700 mb-1">
                        Target UPI ID
                      </label>
                      <input
                        placeholder="staff@okhdfcbank"
                        value={upiId}
                        onChange={(e) => setUpiId(e.target.value)}
                        className="w-full border border-neutral-300 p-2 rounded bg-white text-neutral-950 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-neutral-700 mb-1">
                        Mobile No
                      </label>
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
                  <span className="block text-[10px] font-black uppercase text-neutral-500">
                    Bank Details
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-neutral-700 mb-1">
                        Bank Name *
                      </label>
                      <input
                        required
                        placeholder="e.g. ICICI Bank"
                        value={toBankName}
                        onChange={(e) => setToBankName(e.target.value)}
                        className="w-full border border-neutral-300 p-2 rounded bg-white text-neutral-950 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-neutral-700 mb-1">
                        A/C Number *
                      </label>
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
                    <label className="block text-[10px] font-bold text-neutral-700 mb-1">
                      UTR / Transaction ID *
                    </label>
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
                  <label className="block font-black text-neutral-800 mb-1 uppercase">
                    Description of Cash *
                  </label>
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
                <label className="block font-black text-neutral-800 mb-1 uppercase">
                  Remarks
                </label>
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