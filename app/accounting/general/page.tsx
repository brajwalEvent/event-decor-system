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
  orderBy,
  where,
  updateDoc,
} from "firebase/firestore";
import { useAuth } from "../../../context/AuthContext";
import { useRouter } from "next/navigation";
import type {
  GeneralStaffFloat,
  GeneralFloatExpense,
  PaymentMode,
  PaymentDetails,
} from "../../../types/accounting";
import { recordAuditLog } from "../../../lib/accountingAudit";

export default function GeneralCreditLedgerPage(): React.ReactElement {
  const { user, role, isSuperAdmin, loading } = useAuth();
  const router = useRouter();

  const isAccountant = (role as any) === "accountant";
  const canAccess = isSuperAdmin || isAccountant || role === "admin";

  // Data States
  const [activeFloats, setActiveFloats] = useState<GeneralStaffFloat[]>([]);
  const [settledFloats, setSettledFloats] = useState<GeneralStaffFloat[]>([]);
  const [selectedFloat, setSelectedFloat] = useState<GeneralStaffFloat | null>(null);
  const [expenses, setExpenses] = useState<GeneralFloatExpense[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [crmWeddings, setCrmWeddings] = useState<any[]>([]);
  const [expenseTypes, setExpenseTypes] = useState<string[]>([
    "Resort / Hotel Stay",
    "Team Food & Meals",
    "Vehicle Fuel (Diesel/Petrol)",
    "Fastag & Tolls",
    "Internet & Mobile Recharge",
    "Local Hardware / Procurement",
    "Freight & Rickshaw / Auto",
    "Emergency Miscellaneous",
  ]);
  const [loadingData, setLoadingData] = useState(true);
  const [filterStatus, setFilterStatus] = useState<"ACTIVE" | "SETTLED">("ACTIVE");

  // Modals
  const [showOpenFloatModal, setShowOpenFloatModal] = useState(false);
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [showAddExpenseModal, setShowAddExpenseModal] = useState(false);

  // Form: Open Float Account
  const [disburseStaffUid, setDisburseStaffUid] = useState("");
  const [initialAmount, setInitialAmount] = useState<number | "">("");
  const [disburseDate, setDisburseDate] = useState(new Date().toISOString().split("T")[0]);
  const [disburseMode, setDisburseMode] = useState<PaymentMode>("Bank Transfer - IMPS/RTGS");
  const [disburseFromAccount, setDisburseFromAccount] = useState("");
  const [disburseUpiId, setDisburseUpiId] = useState("");
  const [disburseMobile, setDisburseMobile] = useState("");
  const [disburseBankName, setDisburseBankName] = useState("");
  const [disburseAccNum, setDisburseAccNum] = useState("");
  const [disburseTxnId, setDisburseTxnId] = useState("");
  const [disburseCashDesc, setDisburseCashDesc] = useState("");

  // Form: Top-Up Float
  const [topUpAmount, setTopUpAmount] = useState<number | "">("");
  const [topUpDate, setTopUpDate] = useState(new Date().toISOString().split("T")[0]);
  const [topUpMode, setTopUpMode] = useState<PaymentMode>("UPI");
  const [topUpFromAccount, setTopUpFromAccount] = useState("");
  const [topUpUpiId, setTopUpUpiId] = useState("");
  const [topUpBankName, setTopUpBankName] = useState("");
  const [topUpAccNum, setTopUpAccNum] = useState("");
  const [topUpTxnId, setTopUpTxnId] = useState("");
  const [topUpCashDesc, setTopUpCashDesc] = useState("");
  const [topUpRemarks, setTopUpRemarks] = useState("");

  // Form: Add Expense
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split("T")[0]);
  const [expenseType, setExpenseType] = useState(expenseTypes[0]);
  const [customExpenseType, setCustomExpenseType] = useState("");
  const [isCreatingExpenseType, setIsCreatingExpenseType] = useState(false);
  const [expenseAmount, setExpenseAmount] = useState<number | "">("");
  const [expenseDetails, setExpenseDetails] = useState("");
  const [expenseWeddings, setExpenseWeddings] = useState<string[]>([]);

  useEffect(() => {
    if (!loading && (!user || !canAccess)) {
      router.push("/handovers");
    }
  }, [user, role, isSuperAdmin, loading, canAccess, router]);

  // Load Data
  const loadInitialData = async () => {
    try {
      setLoadingData(true);

      const floatSnap = await getDocs(
        query(collection(db, "accounting_general_floats"), orderBy("createdAt", "desc"))
      );
      const allFloats = floatSnap.docs.map(
        (d) => ({ id: d.id, ...d.data() } as GeneralStaffFloat)
      );

      const active = allFloats.filter((f) => f.status === "ACTIVE");
      const settled = allFloats.filter((f) => f.status === "SETTLED");
      setActiveFloats(active);
      setSettledFloats(settled);

      if (!selectedFloat && active.length > 0) {
        setSelectedFloat(active[0]);
      } else if (!selectedFloat && settled.length > 0) {
        setSelectedFloat(settled[0]);
      }

      const userSnap = await getDocs(collection(db, "users"));
      setStaffList(userSnap.docs.map((d) => ({ uid: d.id, ...d.data() })));

      const leadsSnap = await getDocs(collection(db, "leads")).catch(() => ({ docs: [] }));
      const bookedWeddings = leadsSnap.docs
        .map((d) => ({ id: d.id, ...d.data() } as any))
        .filter((w) => {
          const status = (w.status || "").toLowerCase();
          return (
            status.includes("booked") ||
            status.includes("deal closed") ||
            status.includes("negotiation")
          );
        })
        .map((w) => ({
          id: w.id,
          title: w.title || w.clientName || `Wedding #${w.id}`,
          resortName: w.resortName || "Resort TBD",
          closedDealAmount: Number(w.closedDealAmount || w.quotation?.finalOfferedPrice || 0),
          advanceBookingAmount: Number(w.advanceBookingAmount || 0),
          receivedPayments: w.receivedPayments || [],
          paymentMilestones: w.quotation?.paymentMilestones || [],
        }));

      setCrmWeddings(bookedWeddings);

      const expTypeSnap = await getDocs(collection(db, "accounting_expense_types")).catch(() => ({ docs: [] }));
      const dynamicTypes = expTypeSnap.docs.map((d) => d.data().name).filter(Boolean);
      if (dynamicTypes.length > 0) {
        setExpenseTypes((prev) => Array.from(new Set([...prev, ...dynamicTypes])));
      }
    } catch (err) {
      console.error("Error loading general credit ledger:", err);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (user && canAccess) {
      loadInitialData();
    }
  }, [user, canAccess]);

  // Fetch expenses with in-memory sorting
  const fetchFloatExpenses = async (floatId: string) => {
    try {
      const q = query(
        collection(db, "accounting_general_expenses"),
        where("floatId", "==", floatId)
      );
      const snap = await getDocs(q);
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as GeneralFloatExpense))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setExpenses(list);
    } catch (err) {
      console.error("Error fetching float expenses:", err);
    }
  };

  useEffect(() => {
    if (selectedFloat) {
      fetchFloatExpenses(selectedFloat.id);
    }
  }, [selectedFloat]);

  // Helper: Construct PaymentDetails without undefined values
  const buildPaymentDetails = (
    mode: PaymentMode,
    fromAcc?: string,
    upi?: string,
    mobile?: string,
    bank?: string,
    acc?: string,
    txn?: string,
    cash?: string
  ): PaymentDetails => {
    const details: PaymentDetails = { mode };

    if (fromAcc && fromAcc.trim()) details.fromAccount = fromAcc.trim();

    if (mode === "UPI") {
      if (upi && upi.trim()) details.upiId = upi.trim();
      if (mobile && mobile.trim()) details.mobileNumber = mobile.trim();
    } else if (mode === "Bank Transfer - IMPS/RTGS") {
      if (bank && bank.trim()) details.toBankName = bank.trim();
      if (acc && acc.trim()) details.toAccountNumber = acc.trim();
      if (txn && txn.trim()) details.transactionId = txn.trim();
    } else if (mode === "Cash") {
      if (cash && cash.trim()) details.cashDescription = cash.trim();
    }

    return details;
  };

  // Submit 1: Open Temporary Staff Float
  const handleOpenFloat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !disburseStaffUid || !initialAmount) return;

    const chosenStaff = staffList.find((s) => s.uid === disburseStaffUid);
    const parsedAmount = Number(initialAmount);

    const paymentDetails = buildPaymentDetails(
      disburseMode,
      disburseFromAccount,
      disburseUpiId,
      disburseMobile,
      disburseBankName,
      disburseAccNum,
      disburseTxnId,
      disburseCashDesc
    );

    try {
      const floatRef = doc(collection(db, "accounting_general_floats"));
      const newFloat: GeneralStaffFloat = {
        id: floatRef.id,
        staffUid: disburseStaffUid,
        staffName: chosenStaff?.displayName || chosenStaff?.email || "Staff",
        status: "ACTIVE",
        initialDisbursedAmount: parsedAmount,
        totalTopUpAmount: 0,
        totalSpentAmount: 0,
        currentFloatBalance: parsedAmount,
        disbursementPaymentDetails: paymentDetails,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdByUid: user?.uid || "",
      };

      await setDoc(floatRef, newFloat);

      await recordAuditLog(user, {
        module: "GENERAL_LEDGER",
        action: "DISBURSE",
        targetId: floatRef.id,
        targetName: `Float for ${newFloat.staffName}`,
        newData: newFloat,
        notes: `Disbursed initial float of ₹${parsedAmount} to ${newFloat.staffName} via ${disburseMode}`,
      });

      setShowOpenFloatModal(false);
      setDisburseStaffUid("");
      setInitialAmount("");
      setDisburseFromAccount("");
      setDisburseUpiId("");
      setDisburseMobile("");
      setDisburseBankName("");
      setDisburseAccNum("");
      setDisburseTxnId("");
      setDisburseCashDesc("");

      await loadInitialData();
      setSelectedFloat(newFloat);
      alert(`✅ Temporary Float Account established for ${newFloat.staffName}.`);
    } catch (err: any) {
      console.error(err);
      alert("Failed to initialize staff float: " + err.message);
    }
  };

  // Submit 2: Top-Up Active Float
  const handleTopUpFloat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedFloat || !topUpAmount) return;

    const parsedAmount = Number(topUpAmount);
    const topUpPaymentDetails = buildPaymentDetails(
      topUpMode,
      topUpFromAccount,
      topUpUpiId,
      undefined,
      topUpBankName,
      topUpAccNum,
      topUpTxnId,
      topUpCashDesc
    );

    try {
      const updatedTopUpTotal = selectedFloat.totalTopUpAmount + parsedAmount;
      const updatedBalance = selectedFloat.currentFloatBalance + parsedAmount;

      const updatePayload = {
        totalTopUpAmount: updatedTopUpTotal,
        currentFloatBalance: updatedBalance,
        updatedAt: new Date().toISOString(),
      };

      await updateDoc(doc(db, "accounting_general_floats", selectedFloat.id), updatePayload);

      const topupRecord: any = {
        floatId: selectedFloat.id,
        amount: parsedAmount,
        date: topUpDate,
        paymentDetails: topUpPaymentDetails,
        createdAt: new Date().toISOString(),
        createdByUid: user?.uid || "",
        createdByEmail: user?.email || "Unknown",
      };
      if (topUpRemarks.trim()) {
        topupRecord.remarks = topUpRemarks.trim();
      }

      await addDoc(collection(db, "accounting_general_topups"), topupRecord);

      await recordAuditLog(user, {
        module: "GENERAL_LEDGER",
        action: "TOP_UP",
        targetId: selectedFloat.id,
        targetName: selectedFloat.staffName,
        previousData: {
          balance: selectedFloat.currentFloatBalance,
          topUpTotal: selectedFloat.totalTopUpAmount,
        },
        newData: {
          ...updatePayload,
          topUpAmount: parsedAmount,
          paymentDetails: topUpPaymentDetails,
        },
        notes: `Topped up float with ₹${parsedAmount} via ${topUpMode}`,
      });

      const updated = { ...selectedFloat, ...updatePayload };
      setSelectedFloat(updated);
      setActiveFloats((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));

      setShowTopUpModal(false);
      setTopUpAmount("");
      setTopUpRemarks("");
      setTopUpTxnId("");
      setTopUpCashDesc("");
      alert("✅ Float account successfully topped up.");
    } catch (err: any) {
      console.error(err);
      alert("Failed to top-up float: " + err.message);
    }
  };

  // Submit 3: Log Field Expense
  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedFloat || !expenseAmount || !expenseDetails) return;

    const parsedAmount = Number(expenseAmount);
    const chosenType = isCreatingExpenseType ? customExpenseType.trim() : expenseType;

    try {
      if (isCreatingExpenseType && customExpenseType.trim()) {
        await addDoc(collection(db, "accounting_expense_types"), {
          name: customExpenseType.trim(),
          createdAt: new Date().toISOString(),
        });
        setExpenseTypes((prev) => [...prev, customExpenseType.trim()]);
      }

      const linkedWeddingNames = crmWeddings
        .filter((w) => expenseWeddings.includes(w.id))
        .map((w) => w.title || w.clientName || `Wedding #${w.id}`);

      const expenseData: any = {
        floatId: selectedFloat.id,
        staffUid: selectedFloat.staffUid,
        purchaseType: chosenType,
        amount: parsedAmount,
        date: expenseDate,
        purchaseDetails: expenseDetails.trim(),
        linkedWeddingIds: expenseWeddings.length > 0 ? expenseWeddings : [],
        linkedWeddingNames: linkedWeddingNames,
        createdAt: new Date().toISOString(),
        createdByUid: user?.uid || "",
      };

      await addDoc(collection(db, "accounting_general_expenses"), expenseData);

      const updatedSpent = selectedFloat.totalSpentAmount + parsedAmount;
      const updatedBalance = selectedFloat.currentFloatBalance - parsedAmount;

      const updatePayload = {
        totalSpentAmount: updatedSpent,
        currentFloatBalance: updatedBalance,
        updatedAt: new Date().toISOString(),
      };

      await updateDoc(doc(db, "accounting_general_floats", selectedFloat.id), updatePayload);

      await recordAuditLog(user, {
        module: "GENERAL_LEDGER",
        action: "CREATE",
        targetId: selectedFloat.id,
        targetName: selectedFloat.staffName,
        newData: {
          ...updatePayload,
          expense: expenseData,
        },
        notes: `Logged ₹${parsedAmount} expense for ${chosenType} (${expenseDetails})`,
      });

      const updated = { ...selectedFloat, ...updatePayload };
      setSelectedFloat(updated);
      setActiveFloats((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));

      setShowAddExpenseModal(false);
      setExpenseAmount("");
      setExpenseDetails("");
      setExpenseWeddings([]);
      setIsCreatingExpenseType(false);
      setCustomExpenseType("");
      fetchFloatExpenses(selectedFloat.id);
      alert("✅ Expense logged against staff float.");
    } catch (err: any) {
      console.error(err);
      alert("Failed to log expense: " + err.message);
    }
  };

  // Submit 4: Mathematically Correct Settlement & Reconciliation
  const handleSettleFloat = async () => {
    if (!user || !selectedFloat) return;

    const totalDisbursed = selectedFloat.initialDisbursedAmount + (selectedFloat.totalTopUpAmount || 0);
    const totalSpent = selectedFloat.totalSpentAmount || 0;
    const difference = totalDisbursed - totalSpent; 
    // Positive = Surplus money left with staff to return
    // Negative = Deficit / Out-of-pocket spend by staff to reimburse

    let confirmationMsg = `Settle Float Account for ${selectedFloat.staffName}?\n`;
    confirmationMsg += `Total Disbursed: ₹${totalDisbursed}\n`;
    confirmationMsg += `Total Spent: ₹${totalSpent}\n`;

    if (difference > 0) {
      confirmationMsg += `\n💡 SURPLUS: Staff holds unspent ₹${difference}. This will be REVERSED back to the company account.`;
    } else if (difference < 0) {
      confirmationMsg += `\n💡 DEFICIT: Staff spent ₹{Math.abs(difference)} extra out-of-pocket. This will be REIMBURSED to the staff.`;
    } else {
      confirmationMsg += `\n💡 BALANCED: Zero variance.`;
    }

    if (!window.confirm(confirmationMsg)) return;

    try {
      let updatedTopUps = selectedFloat.totalTopUpAmount || 0;
      let auditNotes = `Settled float with balanced zero variance.`;

      if (difference < 0) {
        // Staff spent MORE: Automatically disburse the deficit as an adjustment top-up
        const extraDeficit = Math.abs(difference);
        updatedTopUps += extraDeficit;

        await addDoc(collection(db, "accounting_general_topups"), {
          floatId: selectedFloat.id,
          amount: extraDeficit,
          date: new Date().toISOString().split("T")[0],
          paymentDetails: { mode: "Bank Transfer - IMPS/RTGS", cashDescription: "Automatic Settlement Deficit Reimbursement" },
          remarks: "Auto-reimbursement for out-of-pocket staff overspend during settlement",
          createdAt: new Date().toISOString(),
          createdByUid: user.uid,
          createdByEmail: user.email,
        });

        auditNotes = `Settled float. Automatically reimbursed out-of-pocket deficit of ₹${extraDeficit} to staff. Balance brought to 0.`;
      } else if (difference > 0) {
        // Staff has SURPLUS: Record surplus reversal transaction
        await addDoc(collection(db, "accounting_general_topups"), {
          floatId: selectedFloat.id,
          amount: -difference, // negative top-up representing cash return
          date: new Date().toISOString().split("T")[0],
          paymentDetails: { mode: "Cash", cashDescription: "Automatic Settlement Cash Surplus Reversal" },
          remarks: "Cash surplus returned to company treasury upon float settlement",
          createdAt: new Date().toISOString(),
          createdByUid: user.uid,
          createdByEmail: user.email,
        });

        auditNotes = `Settled float. Automatically reversed unspent surplus of ₹${difference} back to company treasury. Balance brought to 0.`;
      }

      const updatePayload = {
        status: "SETTLED" as const,
        totalTopUpAmount: updatedTopUps,
        currentFloatBalance: 0, // Brought strictly to zero
        settledAt: new Date().toISOString(),
        settledByUid: user.uid,
        updatedAt: new Date().toISOString(),
      };

      await updateDoc(doc(db, "accounting_general_floats", selectedFloat.id), updatePayload);

      await recordAuditLog(user, {
        module: "GENERAL_LEDGER",
        action: "SETTLE",
        targetId: selectedFloat.id,
        targetName: selectedFloat.staffName,
        previousData: { status: "ACTIVE", balance: selectedFloat.currentFloatBalance },
        newData: updatePayload,
        notes: auditNotes,
      });

      await loadInitialData();
      alert("✅ Float Account has been mathematically reconciled, adjusted, and settled.");
    } catch (err: any) {
      console.error(err);
      alert("Settlement failed: " + err.message);
    }
  };

  if (loading || loadingData) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center font-mono text-xs uppercase tracking-widest text-neutral-600">
        LOADING GENERAL CREDIT LEDGER & PETTY FLOATS...
      </div>
    );
  }

  const currentFloatsList = filterStatus === "ACTIVE" ? activeFloats : settledFloats;

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
              <span className="w-2.5 h-2.5 bg-neutral-950 rounded-full animate-pulse" />
              <p className="text-[10px] uppercase font-mono font-black tracking-widest text-neutral-500">
                BRAJWAL ERP / GENERAL & PETTY EXPENSES
              </p>
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-neutral-950 mt-1">
              General Credit Ledger & Staff Floats
            </h1>
          </div>
           
          <button
            onClick={() => setShowOpenFloatModal(true)}
            className="px-5 py-2.5 rounded-lg font-black text-xs uppercase tracking-wider bg-neutral-900 text-white hover:bg-neutral-800 transition shadow-[4px_4px_10px_rgba(0,0,0,0.15)] active:translate-y-0.5"
          >
            + Disburse Staff Float
          </button>
        </div>

        {/* Master Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Floats List */}
          <div className="lg:col-span-4 space-y-4">
            <div className="bg-white rounded-xl p-4 border border-neutral-200 shadow-[6px_6px_16px_#e5e7eb,-6px_-6px_16px_#ffffff]">
              <div className="flex gap-2 p-1 bg-neutral-100 rounded-lg mb-3">
                <button
                  onClick={() => setFilterStatus("ACTIVE")}
                  className={`flex-1 py-1.5 text-center font-mono text-xs font-black uppercase rounded-md transition ${
                    filterStatus === "ACTIVE" ? "bg-white text-neutral-950 shadow-sm" : "text-neutral-500"
                  }`}
                >
                  Active Floats ({activeFloats.length})
                </button>
                <button
                  onClick={() => setFilterStatus("SETTLED")}
                  className={`flex-1 py-1.5 text-center font-mono text-xs font-black uppercase rounded-md transition ${
                    filterStatus === "SETTLED" ? "bg-white text-neutral-950 shadow-sm" : "text-neutral-500"
                  }`}
                >
                  Settled ({settledFloats.length})
                </button>
              </div>

              {currentFloatsList.length === 0 ? (
                <div className="text-center py-8 text-xs font-mono text-neutral-400">
                  NO {filterStatus} FLOATS RECORDED.
                </div>
              ) : (
                <div className="space-y-2 max-h-[620px] overflow-y-auto pr-1">
                  {currentFloatsList.map((f) => {
                    const isSelected = selectedFloat?.id === f.id;
                    const isDeficit = f.currentFloatBalance < 0;
                    return (
                      <div
                        key={f.id}
                        onClick={() => setSelectedFloat(f)}
                        className={`p-4 rounded-xl cursor-pointer transition border ${
                          isSelected
                            ? "bg-neutral-950 text-white border-neutral-950 shadow-inner"
                            : "bg-white text-neutral-900 border-neutral-200 hover:border-neutral-400 shadow-sm"
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-black text-sm tracking-tight">{f.staffName}</p>
                            <span
                              className={`inline-block mt-1 text-[9px] font-mono px-2 py-0.5 rounded font-black border ${
                                f.status === "ACTIVE"
                                  ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                                  : "bg-neutral-200 text-neutral-700 border-neutral-300"
                              }`}
                            >
                              {f.status}
                            </span>
                          </div>
                          <div className="text-right font-mono">
                            <p className="text-[10px] uppercase text-neutral-400">Float Balance</p>
                            <p
                              className={`text-sm font-black ${
                                isDeficit
                                  ? "text-rose-500"
                                  : f.currentFloatBalance === 0
                                  ? "text-neutral-400"
                                  : isSelected
                                  ? "text-emerald-400"
                                  : "text-emerald-600"
                              }`}
                            >
                              ₹{f.currentFloatBalance.toLocaleString()}
                            </p>
                          </div>
                        </div>

                        <div className="mt-3 pt-2 border-t border-neutral-200/20 flex justify-between text-[11px] font-mono text-neutral-400">
                          <span>Disbursed: ₹{f.initialDisbursedAmount + f.totalTopUpAmount}</span>
                          <span>Spent: ₹{f.totalSpentAmount}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Selected Float Ledger */}
          <div className="lg:col-span-8 space-y-6">
            {selectedFloat ? (
              <>
                <div className="bg-white rounded-xl p-6 border border-neutral-200 shadow-[6px_6px_16px_#e5e7eb,-6px_-6px_16px_#ffffff] space-y-4">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-neutral-100 pb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-xl font-black font-mono text-neutral-950">
                          {selectedFloat.staffName}&apos;s Field Float
                        </h2>
                        <span
                          className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                            selectedFloat.status === "ACTIVE"
                              ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                              : "bg-neutral-100 text-neutral-700 border-neutral-300"
                          }`}
                        >
                          {selectedFloat.status}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-500 font-mono mt-1">
                        Disbursed via:{" "}
                        <strong className="text-neutral-800">
                          {selectedFloat.disbursementPaymentDetails.mode}
                        </strong>{" "}
                        · Created on:{" "}
                        <strong className="text-neutral-800">
                          {new Date(selectedFloat.createdAt).toLocaleDateString()}
                        </strong>
                      </p>
                    </div>

                    {selectedFloat.status === "ACTIVE" && (
                      <div className="flex items-center gap-2 font-mono">
                        <button
                          onClick={() => setShowTopUpModal(true)}
                          className="px-3.5 py-2 bg-neutral-900 text-white rounded-lg text-xs font-black uppercase hover:bg-neutral-800 transition"
                        >
                          + Top-Up Float
                        </button>
                        <button
                          onClick={() => handleSettleFloat()}
                          className="px-3.5 py-2 border border-neutral-400 text-neutral-900 rounded-lg text-xs font-black uppercase hover:bg-neutral-100 transition"
                        >
                          ✓ Settle & Close
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 font-mono">
                    <div className="bg-neutral-50 p-3.5 rounded-xl border border-neutral-200">
                      <p className="text-[10px] uppercase font-black tracking-widest text-neutral-400">
                        Initial Disbursed
                      </p>
                      <p className="text-lg font-black text-neutral-900 mt-1">
                        ₹{selectedFloat.initialDisbursedAmount.toLocaleString()}
                      </p>
                    </div>

                    <div className="bg-neutral-50 p-3.5 rounded-xl border border-neutral-200">
                      <p className="text-[10px] uppercase font-black tracking-widest text-neutral-400">
                        Total Top-Ups
                      </p>
                      <p className="text-lg font-black text-neutral-900 mt-1">
                        ₹{selectedFloat.totalTopUpAmount.toLocaleString()}
                      </p>
                    </div>

                    <div className="bg-neutral-50 p-3.5 rounded-xl border border-neutral-200">
                      <p className="text-[10px] uppercase font-black tracking-widest text-neutral-400">
                        Total Spent
                      </p>
                      <p className="text-lg font-black text-rose-600 mt-1">
                        ₹{selectedFloat.totalSpentAmount.toLocaleString()}
                      </p>
                    </div>

                    <div className="bg-neutral-50 p-3.5 rounded-xl border border-neutral-200">
                      <p className="text-[10px] uppercase font-black tracking-widest text-neutral-400">
                        Remaining Float
                      </p>
                      <p
                        className={`text-lg font-black mt-1 ${
                          selectedFloat.currentFloatBalance < 0
                            ? "text-rose-600"
                            : selectedFloat.currentFloatBalance === 0
                            ? "text-neutral-500"
                            : "text-emerald-600"
                        }`}
                      >
                        ₹{selectedFloat.currentFloatBalance.toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Expenses Log Container */}
                <div className="bg-white rounded-xl border border-neutral-200 shadow-[6px_6px_16px_#e5e7eb,-6px_-6px_16px_#ffffff] overflow-hidden">
                  <div className="p-4 border-b border-neutral-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-neutral-50">
                    <div>
                      <h3 className="text-xs font-mono font-black uppercase tracking-wider text-neutral-900">
                        Field Purchases & Bills ({expenses.length})
                      </h3>
                      <p className="text-[11px] text-neutral-500 font-mono">
                        Stay, Fuel, Food & Local Supplies
                      </p>
                    </div>

                    {selectedFloat.status === "ACTIVE" && (
                      <button
                        onClick={() => setShowAddExpenseModal(true)}
                        className="px-4 py-2 rounded-lg font-mono text-xs font-black uppercase bg-neutral-950 text-white hover:bg-neutral-800 transition"
                      >
                        + Log Expense
                      </button>
                    )}
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-medium font-mono">
                      <thead className="bg-white border-b border-neutral-200 text-neutral-400 text-[10px] uppercase">
                        <tr>
                          <th className="p-3.5">Date</th>
                          <th className="p-3.5">Category</th>
                          <th className="p-3.5">Amount</th>
                          <th className="p-3.5">Details</th>
                          <th className="p-3.5">Weddings</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {expenses.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="p-8 text-center text-neutral-400 text-xs">
                              NO EXPENSES FILED AGAINST THIS FLOAT YET.
                            </td>
                          </tr>
                        ) : (
                          expenses.map((exp) => {
                            const matchedWeddings = 
                              (exp as any).linkedWeddingNames && (exp as any).linkedWeddingNames.length > 0
                                ? (exp as any).linkedWeddingNames
                                : crmWeddings
                                    .filter((w) => exp.linkedWeddingIds?.includes(w.id))
                                    .map((w) => w.title || w.clientName);

                            return (
                              <tr key={exp.id} className="hover:bg-neutral-50/80 transition">
                                <td className="p-3.5 font-bold whitespace-nowrap">{exp.date}</td>
                                <td className="p-3.5 whitespace-nowrap">
                                  <span className="px-2 py-0.5 rounded text-[10px] font-black border border-neutral-300 bg-neutral-100 text-neutral-800">
                                    {exp.purchaseType}
                                  </span>
                                </td>
                                <td className="p-3.5 font-black text-sm whitespace-nowrap text-neutral-950">
                                  ₹{exp.amount.toLocaleString()}
                                </td>
                                <td className="p-3.5 max-w-sm text-neutral-700">{exp.purchaseDetails}</td>
                                <td className="p-3.5 max-w-xs">
                                  {matchedWeddings.length > 0 ? (
                                    <div className="flex flex-wrap gap-1">
                                      {matchedWeddings.map((m: any, i: number) => (
                                        <span
                                          key={i}
                                          className="text-[9px] bg-neutral-100 px-1.5 py-0.5 rounded border border-neutral-200"
                                        >
                                          💍 {m}
                                        </span>
                                      ))}
                                    </div>
                                  ) : (
                                    <span className="text-neutral-400">—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-white rounded-xl p-12 text-center border border-neutral-200 text-neutral-400 font-mono text-xs">
                SELECT A TEMPORARY FLOAT ACCOUNT FROM THE LIST TO MONITOR PETTY DISBURSEMENTS.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal 1: Open Temporary Staff Float */}
      {showOpenFloatModal && (
        <div className="fixed inset-0 bg-neutral-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 border border-neutral-300 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto font-mono text-xs">
            <div className="flex justify-between items-center border-b border-neutral-200 pb-3">
              <h2 className="text-base font-black uppercase text-neutral-950">
                Disburse Temporary Float
              </h2>
              <button onClick={() => setShowOpenFloatModal(false)} className="text-neutral-400 hover:text-black font-black">
                ✕
              </button>
            </div>

            <form onSubmit={handleOpenFloat} className="space-y-4">
              <div>
                <label className="block font-black text-neutral-800 mb-1 uppercase">Choose Staff Member *</label>
                <select
                  required
                  value={disburseStaffUid}
                  onChange={(e) => setDisburseStaffUid(e.target.value)}
                  className="w-full border border-neutral-300 p-2.5 rounded-lg bg-neutral-50 focus:bg-white text-neutral-950 font-bold outline-none"
                >
                  <option value="">-- Choose Staff --</option>
                  {staffList.map((s) => (
                    <option key={s.uid} value={s.uid}>
                      {s.displayName || s.email} ({s.role?.toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-black text-neutral-800 mb-1 uppercase">Initial Amount (₹) *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="e.g. 20000"
                    value={initialAmount}
                    onChange={(e) => setInitialAmount(Number(e.target.value))}
                    className="w-full border border-neutral-300 p-2.5 rounded-lg bg-neutral-50 focus:bg-white text-neutral-950 font-bold outline-none"
                  />
                </div>
                <div>
                  <label className="block font-black text-neutral-800 mb-1 uppercase">Disbursal Date *</label>
                  <input
                    type="date"
                    required
                    value={disburseDate}
                    onChange={(e) => setDisburseDate(e.target.value)}
                    className="w-full border border-neutral-300 p-2.5 rounded-lg bg-neutral-50 focus:bg-white text-neutral-950 font-bold outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-black text-neutral-800 mb-1 uppercase">Mode of Payment *</label>
                <select
                  value={disburseMode}
                  onChange={(e) => setDisburseMode(e.target.value as PaymentMode)}
                  className="w-full border border-neutral-300 p-2.5 rounded-lg bg-neutral-50 focus:bg-white text-neutral-950 font-bold outline-none"
                >
                  <option value="Bank Transfer - IMPS/RTGS">3 - Bank Transfer - IMPS/RTGS</option>
                  <option value="UPI">2 - UPI</option>
                  <option value="Cash">1 - Cash</option>
                </select>
              </div>

              <div>
                <label className="block font-black text-neutral-800 mb-1 uppercase">Debited From Company A/C</label>
                <input
                  placeholder="e.g. HDFC Current #00129"
                  value={disburseFromAccount}
                  onChange={(e) => setDisburseFromAccount(e.target.value)}
                  className="w-full border border-neutral-300 p-2.5 rounded-lg bg-neutral-50 focus:bg-white text-neutral-950 outline-none"
                />
              </div>

              {/* Conditional UPI */}
              {disburseMode === "UPI" && (
                <div className="bg-neutral-50 p-3 rounded-xl border border-neutral-300 space-y-2">
                  <span className="block font-black uppercase text-neutral-600">UPI Payment Specifics</span>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      placeholder="Target UPI ID"
                      value={disburseUpiId}
                      onChange={(e) => setDisburseUpiId(e.target.value)}
                      className="border border-neutral-300 p-2 rounded bg-white text-neutral-950"
                    />
                    <input
                      placeholder="Target Mobile No"
                      value={disburseMobile}
                      onChange={(e) => setDisburseMobile(e.target.value)}
                      className="border border-neutral-300 p-2 rounded bg-white text-neutral-950"
                    />
                  </div>
                </div>
              )}

              {/* Conditional Bank Transfer */}
              {disburseMode === "Bank Transfer - IMPS/RTGS" && (
                <div className="bg-neutral-50 p-3 rounded-xl border border-neutral-300 space-y-2">
                  <span className="block font-black uppercase text-neutral-600">Bank Transfer Details</span>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      required
                      placeholder="Bank Name"
                      value={disburseBankName}
                      onChange={(e) => setDisburseBankName(e.target.value)}
                      className="border border-neutral-300 p-2 rounded bg-white text-neutral-950"
                    />
                    <input
                      required
                      placeholder="A/C Number"
                      value={disburseAccNum}
                      onChange={(e) => setDisburseAccNum(e.target.value)}
                      className="border border-neutral-300 p-2 rounded bg-white text-neutral-950"
                    />
                  </div>
                  <input
                    required
                    placeholder="Transaction ID / UTR"
                    value={disburseTxnId}
                    onChange={(e) => setDisburseTxnId(e.target.value)}
                    className="w-full border border-neutral-300 p-2 rounded bg-white text-neutral-950"
                  />
                </div>
              )}

              {/* Conditional Cash */}
              {disburseMode === "Cash" && (
                <div>
                  <label className="block font-black text-neutral-800 mb-1 uppercase">Description of Cash *</label>
                  <textarea
                    required
                    rows={2}
                    placeholder="e.g. Physical cash handed over at destination..."
                    value={disburseCashDesc}
                    onChange={(e) => setDisburseCashDesc(e.target.value)}
                    className="w-full border border-neutral-300 p-2.5 rounded-lg bg-neutral-50 focus:bg-white text-neutral-950 outline-none"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={() => setShowOpenFloatModal(false)}
                  className="px-4 py-2 border border-neutral-300 font-bold rounded-lg uppercase"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-neutral-950 text-white font-black rounded-lg uppercase hover:bg-neutral-800 transition"
                >
                  Open Float & Disburse
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Top-Up Active Float */}
      {showTopUpModal && selectedFloat && (
        <div className="fixed inset-0 bg-neutral-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 border border-neutral-300 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto font-mono text-xs">
            <div className="flex justify-between items-center border-b border-neutral-200 pb-3">
              <div>
                <h2 className="text-base font-black uppercase text-neutral-950">Top-Up Staff Float</h2>
                <p className="text-[11px] text-neutral-500">Beneficiary: {selectedFloat.staffName}</p>
              </div>
              <button onClick={() => setShowTopUpModal(false)} className="text-neutral-400 hover:text-black font-black">
                ✕
              </button>
            </div>

            <form onSubmit={handleTopUpFloat} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-black text-neutral-800 mb-1 uppercase">Top-Up Amount (₹) *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="e.g. 10000"
                    value={topUpAmount}
                    onChange={(e) => setTopUpAmount(Number(e.target.value))}
                    className="w-full border border-neutral-300 p-2.5 rounded-lg bg-neutral-50 focus:bg-white text-neutral-950 font-bold outline-none"
                  />
                </div>
                <div>
                  <label className="block font-black text-neutral-800 mb-1 uppercase">Date *</label>
                  <input
                    type="date"
                    required
                    value={topUpDate}
                    onChange={(e) => setTopUpDate(e.target.value)}
                    className="w-full border border-neutral-300 p-2.5 rounded-lg bg-neutral-50 focus:bg-white text-neutral-950 font-bold outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-black text-neutral-800 mb-1 uppercase">Mode of Payment *</label>
                <select
                  value={topUpMode}
                  onChange={(e) => setTopUpMode(e.target.value as PaymentMode)}
                  className="w-full border border-neutral-300 p-2.5 rounded-lg bg-neutral-50 focus:bg-white text-neutral-950 font-bold outline-none"
                >
                  <option value="UPI">2 - UPI</option>
                  <option value="Bank Transfer - IMPS/RTGS">3 - Bank Transfer - IMPS/RTGS</option>
                  <option value="Cash">1 - Cash</option>
                </select>
              </div>

              {topUpMode === "UPI" && (
                <div>
                  <label className="block text-[10px] font-bold text-neutral-700 mb-1">Target UPI ID</label>
                  <input
                    placeholder="e.g. staff@okicici"
                    value={topUpUpiId}
                    onChange={(e) => setTopUpUpiId(e.target.value)}
                    className="w-full border border-neutral-300 p-2 rounded bg-neutral-50 focus:bg-white text-neutral-950"
                  />
                </div>
              )}

              {topUpMode === "Bank Transfer - IMPS/RTGS" && (
                <div className="grid grid-cols-2 gap-2">
                  <input
                    placeholder="Bank Name"
                    value={topUpBankName}
                    onChange={(e) => setTopUpBankName(e.target.value)}
                    className="border border-neutral-300 p-2 rounded bg-neutral-50 focus:bg-white"
                  />
                  <input
                    placeholder="Transaction ID / UTR"
                    value={topUpTxnId}
                    onChange={(e) => setTopUpTxnId(e.target.value)}
                    className="border border-neutral-300 p-2 rounded bg-neutral-50 focus:bg-white"
                  />
                </div>
              )}

              {topUpMode === "Cash" && (
                <div>
                  <label className="block font-black text-neutral-800 mb-1 uppercase">Description of Cash *</label>
                  <textarea
                    required
                    rows={2}
                    placeholder="Physical cash given..."
                    value={topUpCashDesc}
                    onChange={(e) => setTopUpCashDesc(e.target.value)}
                    className="w-full border border-neutral-300 p-2 rounded bg-neutral-50 focus:bg-white"
                  />
                </div>
              )}

              <div>
                <label className="block font-black text-neutral-800 mb-1 uppercase">Top-Up Reason / Remarks</label>
                <input
                  placeholder="e.g. Extra diesel and resort deposit"
                  value={topUpRemarks}
                  onChange={(e) => setTopUpRemarks(e.target.value)}
                  className="w-full border border-neutral-300 p-2.5 rounded-lg bg-neutral-50 focus:bg-white text-neutral-950 outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={() => setShowTopUpModal(false)}
                  className="px-4 py-2 border border-neutral-300 font-bold rounded-lg uppercase"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-neutral-950 text-white font-black rounded-lg uppercase hover:bg-neutral-800 transition"
                >
                  Disburse Top-Up
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 3: Log Field Expense */}
      {showAddExpenseModal && selectedFloat && (
        <div className="fixed inset-0 bg-neutral-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 border border-neutral-300 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto font-mono text-xs">
            <div className="flex justify-between items-center border-b border-neutral-200 pb-3">
              <div>
                <h2 className="text-base font-black uppercase text-neutral-950">Log Field Expense</h2>
                <p className="text-[11px] text-neutral-500">Staff: {selectedFloat.staffName}</p>
              </div>
              <button onClick={() => setShowAddExpenseModal(false)} className="text-neutral-400 hover:text-black font-black">
                ✕
              </button>
            </div>

            <form onSubmit={handleAddExpense} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-black text-neutral-800 mb-1 uppercase">Date Of Expense *</label>
                  <input
                    type="date"
                    required
                    value={expenseDate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                    className="w-full border border-neutral-300 p-2.5 rounded-lg bg-neutral-50 focus:bg-white text-neutral-950 font-bold outline-none"
                  />
                </div>
                <div>
                  <label className="block font-black text-neutral-800 mb-1 uppercase">Amount Spent (₹) *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="e.g. 4200"
                    value={expenseAmount}
                    onChange={(e) => setExpenseAmount(Number(e.target.value))}
                    className="w-full border border-neutral-300 p-2.5 rounded-lg bg-neutral-50 focus:bg-white text-neutral-950 font-bold outline-none"
                  />
                </div>
              </div>

              {/* Type of Purchase */}
              <div>
                <label className="block font-black text-neutral-800 mb-1 uppercase">Type of Purchase *</label>
                {!isCreatingExpenseType ? (
                  <div className="flex gap-2">
                    <select
                      value={expenseType}
                      onChange={(e) => setExpenseType(e.target.value)}
                      className="flex-1 border border-neutral-300 p-2.5 rounded-lg bg-neutral-50 focus:bg-white text-neutral-950 font-bold outline-none"
                    >
                      {expenseTypes.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setIsCreatingExpenseType(true)}
                      className="px-3 py-2 border border-neutral-300 rounded-lg font-black hover:bg-neutral-100 uppercase text-[10px]"
                    >
                      + New
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      placeholder="Type custom category..."
                      value={customExpenseType}
                      onChange={(e) => setCustomExpenseType(e.target.value)}
                      className="flex-1 border border-neutral-300 p-2.5 rounded-lg bg-white font-bold outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setIsCreatingExpenseType(false)}
                      className="px-3 py-2 bg-neutral-200 rounded-lg font-black text-[10px] uppercase"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="block font-black text-neutral-800 mb-1 uppercase">
                  Purchase Details (Resort, Fuel, Fastag, etc.) *
                </label>
                <textarea
                  required
                  rows={2}
                  placeholder="e.g. Fastag toll recharge #9921, Diesel receipt at IndianOil Bunk..."
                  value={expenseDetails}
                  onChange={(e) => setExpenseDetails(e.target.value)}
                  className="w-full border border-neutral-300 p-2.5 rounded-lg bg-neutral-50 focus:bg-white text-neutral-950 font-medium outline-none"
                />
              </div>

              {/* Optional CRM Wedding Selector */}
              <div>
                <label className="block font-black text-neutral-800 mb-1 uppercase">
                  Optional: Link to Wedding(s)
                </label>
                {crmWeddings.length === 0 ? (
                  <p className="text-[11px] text-neutral-400 italic">No booked weddings in CRM.</p>
                ) : (
                  <div className="max-h-32 overflow-y-auto border border-neutral-300 p-2 rounded-lg bg-neutral-50 space-y-1">
                    {crmWeddings.map((w) => {
                      const isChecked = expenseWeddings.includes(w.id);
                      return (
                        <label
                          key={w.id}
                          className="flex items-center gap-2 p-1.5 rounded hover:bg-white cursor-pointer transition text-[11px]"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setExpenseWeddings([...expenseWeddings, w.id]);
                              } else {
                                setExpenseWeddings(expenseWeddings.filter((id) => id !== w.id));
                              }
                            }}
                          />
                          <span className="font-bold text-neutral-800">
                            💍 {w.title} — {w.resortName} (Deal: ₹{w.closedDealAmount?.toLocaleString()})
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={() => setShowAddExpenseModal(false)}
                  className="px-4 py-2 border border-neutral-300 font-bold rounded-lg uppercase"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-neutral-950 text-white font-black rounded-lg uppercase hover:bg-neutral-800 transition"
                >
                  Deduct & Log Expense
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}