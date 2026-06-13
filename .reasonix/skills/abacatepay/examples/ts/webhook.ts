import express from 'express';
import crypto from 'crypto';

const app = express();

app.use(express.json({
    verify: (req: any, res, buf) => {
        req.rawBody = buf;
    }
}));

const WEBHOOK_SECRET = process.env.ABACATEPAY_WEBHOOK_SECRET;

app.post('/webhooks/abacatepay', async (req, res) => {
    const signature = req.headers['x-webhook-signature'] as string;
    const timestamp = req.headers['x-webhook-timestamp'] as string;
    const secretFromQuery = req.query.webhookSecret as string;

    // Validation
    if (!req.body || !req.body.id) {
        console.error('Invalid payload structure');
        return res.status(400).send('Invalid payload');
    }

    if (secretFromQuery !== WEBHOOK_SECRET) {
        console.error('Invalid secret query');
        return res.status(401).send('Invalid secret query');
    }

    // Timestamp check to prevent replay attacks
    if (!timestamp || Math.abs(Date.now() / 1000 - parseInt(timestamp)) > 300) { // 5 minutes
        console.error('Invalid or expired timestamp');
        return res.status(401).send('Invalid timestamp');
    }

    const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET as string);
    hmac.update(req.rawBody);
    const expectedSignature = hmac.digest('base64');

    // Constant-time comparison to prevent timing attacks
    if (!crypto.timingSafeEqual(Buffer.from(signature, 'base64'), Buffer.from(expectedSignature, 'base64'))) {
        console.error('Invalid signature');
        return res.status(401).send('Invalid signature');
    }

    const { event: eventType, id, data } = req.body;
    console.log('Received event:', eventType, 'ID:', id);

    try {
        // Idempotency check (assume a processedEvents set or DB)
        if (processedEvents.has(id)) {
            console.log('Event already processed:', id);
            return res.status(200).send('Already processed');
        }

        if (eventType === 'billing.paid') {
            console.log('Payment confirmed for:', data.id);
            // Process payment logic
            processedEvents.add(id);
        }

        res.status(200).send('OK');
    } catch (error: any) {
        console.error('Error processing webhook:', error.message);
        // For failures, return 500 to trigger retry
        res.status(500).send('Processing failed');
    }
});