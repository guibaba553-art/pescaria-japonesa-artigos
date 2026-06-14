import express from 'express';
import request from 'supertest';
import crypto from 'crypto';

// Assuming the webhook handler is exported or we can test the route
// For this example, we'll simulate the app setup

describe('Webhook Handler', () => {
  let app: express.Application;
  const secret = 'test_secret';

  beforeEach(() => {
    app = express();
    app.use(express.json({
      verify: (req: any, res, buf) => {
        req.rawBody = buf;
      }
    }));

    app.post('/webhooks/abacatepay', (req, res) => {
      const signature = req.headers['x-webhook-signature'];
      const secretFromQuery = req.query.webhookSecret;

      if (secretFromQuery !== secret) {
        return res.status(401).send('Invalid secret query');
      }

      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(req.rawBody);
      const expectedSignature = hmac.digest('base64');

      if (signature !== expectedSignature) {
        return res.status(401).send('Invalid signature');
      }

      const { event: eventType, data } = req.body;
      console.log('Received event:', eventType);

      if (eventType === 'billing.paid') {
        console.log('Payment confirmed for:', data.id);
      }

      res.status(200).send('OK');
    });
  });

  test('should accept valid webhook', async () => {
    const body = { event: 'billing.paid', data: { id: '123' } };
    const bodyString = JSON.stringify(body);
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(Buffer.from(bodyString));
    const signature = hmac.digest('base64');

    const response = await request(app)
      .post('/webhooks/abacatepay?webhookSecret=' + secret)
      .set('x-webhook-signature', signature)
      .set('Content-Type', 'application/json')
      .send(body);

    expect(response.status).toBe(200);
    expect(response.text).toBe('OK');
  });

  test('should reject invalid secret', async () => {
    const response = await request(app)
      .post('/webhooks/abacatepay?webhookSecret=wrong')
      .send({});

    expect(response.status).toBe(401);
    expect(response.text).toBe('Invalid secret query');
  });

  test('should reject invalid signature', async () => {
    const response = await request(app)
      .post('/webhooks/abacatepay?webhookSecret=' + secret)
      .set('x-webhook-signature', 'invalid')
      .send({});

    expect(response.status).toBe(401);
    expect(response.text).toBe('Invalid signature');
  });
});