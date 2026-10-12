import { db } from "./firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { AuditLogEntry } from "../types/accounting";

/**
 * Recursively removes undefined values from objects so Firestore doesn't reject them.
 */
function sanitizeForFirestore(obj: any): any {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeForFirestore);

  return Object.fromEntries(
    Object.entries(obj)
      .filter(([_, v]) => v !== undefined)
      .map(([k, v]) => [k, sanitizeForFirestore(v)])
  );
}

/**
 * Writes an immutable audit entry to Firestore.
 * This collection should be protected in firestore.rules to disallow update/delete.
 */
export async function recordAuditLog(
  user: { uid: string; email?: string | null; displayName?: string | null },
  log: Omit<AuditLogEntry, "id" | "timestamp" | "performedByUid" | "performedByEmail" | "performedByName">
) {
  try {
    const rawData = {
      ...log,
      performedByUid: user.uid,
      performedByEmail: user.email || "Unknown",
      performedByName: user.displayName || user.email || "Unknown",
      timestamp: new Date().toISOString(),
      firestoreCreatedAt: serverTimestamp(),
    };

    // Strip out all undefined values to prevent Firestore crashes
    const sanitizedData = sanitizeForFirestore(rawData);

    await addDoc(collection(db, "accounting_audit_logs"), sanitizedData);
  } catch (error) {
    console.error("CRITICAL: Failed to write non-editable audit log", error);
    throw new Error("Audit logging failed. Operation halted for security.");
  }
}