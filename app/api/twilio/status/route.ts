import { db } from "../../../../lib/firebase";
import { collectionGroup, getDocs, updateDoc, doc, query, where } from "firebase/firestore";

export async function POST(req: Request) {
  try {
    const textData = await req.text();
    const params = new URLSearchParams(textData);

    const messageSid = params.get("MessageSid") || params.get("SmsSid");
    const messageStatus = params.get("MessageStatus") || params.get("SmsStatus"); // 'sent', 'delivered', 'read', 'failed'

    if (messageSid && messageStatus) {
      console.log(`[Twilio Status] SID: ${messageSid} -> Status: ${messageStatus}`);

      // Query across all messages by Twilio SID
      const q = query(collectionGroup(db, "messages"), where("sid", "==", messageSid));
      const snap = await getDocs(q);

      // MUST use for...of so serverless awaits Firestore writes before closing response
      for (const d of snap.docs) {
        // 1. Update the individual message status
        await updateDoc(doc(db, d.ref.path), {
          status: messageStatus,
          statusUpdatedAt: new Date().toISOString(),
        });

        // 2. Update the parent guest document so the main table shows delivered/read
        const guestDocRef = d.ref.parent.parent;
        if (guestDocRef) {
          await updateDoc(doc(db, guestDocRef.path), {
            whatsappStatus: messageStatus,
          });
        }
      }
    }

    return new Response("<Response></Response>", { headers: { "Content-Type": "text/xml" } });
  } catch (err) {
    console.error("Status callback error:", err);
    return new Response("<Response></Response>", { headers: { "Content-Type": "text/xml" } });
  }
}