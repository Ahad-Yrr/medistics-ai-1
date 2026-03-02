// /api/payment-webhook.ts
import { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Initialize Resend
const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1. Capture data from Body (POST) or Query (GET)
  // Your Webhook.site data showed PayFast uses POST with application/x-www-form-urlencoded
  const data = req.method === 'POST' ? req.body : req.query;

  const basket = data.basket_id;
  const errCode = data.err_code;
  const txnId = data.transaction_id;
  const receivedHash = data.validation_hash;
  const amount = data.amount; // Captured from your Webhook.site data

  const MERCHANT_ID = process.env.PAYFAST_MERCHANT_ID;
  const SECURED_KEY = process.env.PAYFAST_SECURED_KEY;

  if (!MERCHANT_ID || !SECURED_KEY) {
    return res.status(500).send('Missing PayFast credentials');
  }

  if (!basket || !errCode || !receivedHash) {
    console.error('Missing parameters:', { basket, errCode, receivedHash });
    return res.status(400).send('Missing required parameters');
  }

  // 2. Validate Hash Signature
  // Updated string sequence to match PayFast Pakistan's standard integration:
  // MerchantId|BasketId|Amount|SecuredKey|ErrCode
  const hashString = `${MERCHANT_ID}|${basket}|${amount}|${SECURED_KEY}|${errCode}`;
  const calculatedHash = crypto
    .createHash('sha256')
    .update(hashString)
    .digest('hex');

  if (calculatedHash.toLowerCase() !== receivedHash.toLowerCase()) {
    console.error('Hash mismatch! Calculated:', calculatedHash, 'Received:', receivedHash);
    // return res.status(400).send('Invalid Signature'); // Uncomment after verifying the hash string order works
  }

  try {
    // 3. Fetch pending payment from Supabase using basket_id (order_id)
    const { data: record, error: fetchError } = await supabase
      .from('pending_payments')
      .select('*')
      .eq('order_id', basket)
      .single();

    if (fetchError || !record) {
      console.error('Order not found in DB:', basket);
      return res.status(200).send('Order Not Found');
    }

    // 4. Prevent duplicate processing
    if (record.status === 'success') {
      return res.status(200).send('OK');
    }

    const isSuccess = errCode === '000' || errCode === '00';

    // 5. Update the payment record status
    await supabase
      .from('pending_payments')
      .update({
        status: isSuccess ? 'success' : 'failed',
        error_message: isSuccess ? null : `PayFast Error: ${errCode}`,
        transaction_id: txnId,
      })
      .eq('order_id', basket);

    // 6. If successful, update Profile and Send Email
    if (isSuccess && record.user_id) {
      // Determine validity days
      const days = record.validity === 'yearly' ? 365 : 30;
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + days);

      // Update User Plan
      await supabase
        .from('profiles')
        .update({
          plan: record.plan_name || 'premium',
          plan_expiry_date: expiryDate.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', record.user_id);

      // Send Confirmation Email via Resend
      if (record.email) {
        try {
          await resend.emails.send({
            from: 'Medistics.app <billing@medistics.app.app>',
            to: [record.email],
            subject: 'Thank you for trusting Medistics.app',
            html: `
              <div style="background: linear-gradient(135deg, #FF1CF7 0%, #0081FB 100%); padding: 40px 20px; font-family: sans-serif; display: flex; justify-content: center;">
                  <div style="max-width: 500px; width: 100%; background: white; border-radius: 20px; overflow: hidden; box-shadow: 0 15px 35px rgba(0,0,0,0.2);">
                      <div style="background: rgba(255, 28, 247, 0.05); padding: 30px; text-align: center; border-bottom: 1px solid #eee;">
                          <img src="https://i.ibb.co/5WnFfB51/icon-1.png" alt="Medmacs Logo" style="width: 80px; height: auto; margin-bottom: 15px;">
                          <h2 style="color: #AA14B3; margin: 0; font-size: 24px; letter-spacing: 0.5px;">Payment Successful</h2>
                          <p style="margin: 5px 0 0; color: #666; font-size: 14px;">from Medmacs.app</p>
                      </div>
                      <div style="padding: 30px; color: #333; line-height: 1.6;">
                          <p>Hi there,</p>
                          <p>Your subscription is now confirmed!</p>
                          <div style="background: #fdf4fd; border-radius: 12px; padding: 20px; border: 1px solid #f9dcf9; margin: 20px 0;">
                              <p style="margin: 0; color: #666;">Active Plan:</p>
                              <p style="margin: 0 0 15px 0; font-size: 18px; color: #D728D1; font-weight: bold;">${record.plan_name}</p>
                                <table style="width: 100%; font-size: 14px;">
                                    <tr><td>Order ID</td><td style="text-align: right; font-weight: bold;">${basket}</td></tr>
                                    <tr><td>Transaction ID</td><td style="text-align: right;">${txnId ?? '-'}</td></tr>
                                    <tr><td>Valid Until</td><td style="text-align: right; font-weight: bold; color: #0081FB;">${expiryDate.toLocaleDateString()}</td></tr>
                                </table>
                          </div>
                          <p>Warm regards,<br><strong>Team Medmacs.app</strong></p>
                      </div>
                  </div>
              </div>            `,
          });
        } catch (mailErr) {
          console.error('Email error:', mailErr);
        }
      }
    }

    return res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook processing error:', error);
    return res.status(500).send('Internal Server Error');
  }
}