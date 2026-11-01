import { db } from "../../../../lib/firebase";
import { collectionGroup, getDocs, updateDoc, doc, query, where, collection } from "firebase/firestore";

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const qHandoverId = url.searchParams.get("handoverId");
    const qGuestId = url.searchParams.get("guestId");

    const textData = await req.text();
    const params = new URLSearchParams(textData);

    const messageSid = params.get("MessageSid") || params.get("SmsSid");
    const messageStatus = params.get("MessageStatus") || params.get("SmsStatus"); // 'sent', 'delivered', 'read', 'failed'

    if (messageSid && messageStatus) {
      console.log(`[Twilio Status Webhook] SID: ${messageSid} -> Status: ${messageStatus}`);

      // Fast-path: If handoverId and guestId were passed in the callback URL
      if (qHandoverId && qGuestId) {
        const msgCol = collection(db, "handovers", qHandoverId, "rsvps", qGuestId, "messages");
        const qMsg = query(msgCol, where("sid", "==", messageSid));
        const snap = await getDocs(qMsg);

        for (const d of snap.docs) {
          await updateDoc(doc(db, d.ref.path), {
            status: messageStatus,
            statusUpdatedAt: new Date().toISOString(),
          });
        }

        // Also update parent guest document status
        await updateDoc(doc(db, "handovers", qHandoverId, "rsvps", qGuestId), {
          whatsappStatus: messageStatus,
        });
      } else {
        // Fallback: collectionGroup across all messages
        const q = query(collectionGroup(db, "messages"), where("sid", "==", messageSid));
        const snap = await getDocs(q);

        for (const d of snap.docs) {
          await updateDoc(doc(db, d.ref.path), {
            status: messageStatus,
            statusUpdatedAt: new Date().toISOString(),
          });

          const guestDocRef = d.ref.parent.parent;
          if (guestDocRef) {
            await updateDoc(doc(db, guestDocRef.path), {
              whatsappStatus: messageStatus,
            });
          }
        }
      }
    }

    return new Response("<Response></Response>", { headers: { "Content-Type": "text/xml" } });
  } catch (err) {
    console.error("Status callback error:", err);
    return new Response("<Response></Response>", { headers: { "Content-Type": "text/xml" } });
  }
}