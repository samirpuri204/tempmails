interface Env {
  APP_URL: string;
  INBOUND_SECRET: string;
  CRON_SECRET: string;
  MAX_RAW_BYTES: string;
  SPOOL: R2Bucket;
  MAIL_QUEUE: Queue<Job>;
}
interface Job {
  key: string;
  recipient: string;
  eventId: string;
}
export default {
  async scheduled(_controller: ScheduledController, env: Env) {
    const response = await fetch(`${env.APP_URL}/api/cron/cleanup`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
      signal: AbortSignal.timeout(55000),
    });
    if (!response.ok) throw new Error(`CLEANUP_FAILED_${response.status}`);
  },
  async email(message: ForwardableEmailMessage, env: Env) {
    if (message.rawSize > Number(env.MAX_RAW_BYTES)) {
      message.setReject("Message exceeds service size limit");
      return;
    }
    const bytes = await new Response(message.raw).arrayBuffer();
    if (bytes.byteLength > Number(env.MAX_RAW_BYTES)) {
      message.setReject("Message exceeds service size limit");
      return;
    }
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const eventId = Array.from(new Uint8Array(digest), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    const key = crypto.randomUUID();
    await env.SPOOL.put(key, bytes, {
      httpMetadata: { contentType: "application/octet-stream" },
    });
    // Await queue acceptance. Do not acknowledge email delivery on spool/queue failure.
    await env.MAIL_QUEUE.send({ key, recipient: message.to, eventId });
  },
  async queue(batch: MessageBatch<Job>, env: Env) {
    for (const job of batch.messages) {
      try {
        const object = await env.SPOOL.get(job.body.key);
        if (!object) {
          console.error(
            JSON.stringify({ code: "SPOOL_MISSING", jobId: job.id }),
          );
          job.ack();
          continue;
        }
        const bytes = new Uint8Array(await object.arrayBuffer());
        let binary = "";
        for (let i = 0; i < bytes.length; i += 8192)
          binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        const body = JSON.stringify({
          provider: "cloudflare",
          eventId: job.body.eventId,
          recipient: job.body.recipient,
          raw: btoa(binary),
        });
        const timestamp = String(Math.floor(Date.now() / 1000));
        const key = await crypto.subtle.importKey(
          "raw",
          new TextEncoder().encode(env.INBOUND_SECRET),
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["sign"],
        );
        const sig = await crypto.subtle.sign(
          "HMAC",
          key,
          new TextEncoder().encode(`${timestamp}.${body}`),
        );
        const signature = Array.from(new Uint8Array(sig), (b) =>
          b.toString(16).padStart(2, "0"),
        ).join("");
        const response = await fetch(`${env.APP_URL}/api/inbound`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-mail-timestamp": timestamp,
            "x-mail-signature": signature,
          },
          body,
          signal: AbortSignal.timeout(25000),
        });
        if (response.ok || [400, 410, 413, 422].includes(response.status)) {
          await env.SPOOL.delete(job.body.key);
          job.ack();
        } else
          job.retry({
            delaySeconds: Math.min(3600, 30 * 2 ** Math.min(job.attempts, 7)),
          });
      } catch {
        console.error(
          JSON.stringify({ code: "DELIVERY_RETRY", jobId: job.id }),
        );
        job.retry({ delaySeconds: 60 });
      }
    }
  },
} satisfies ExportedHandler<Env, Job>;
