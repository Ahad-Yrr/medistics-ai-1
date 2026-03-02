import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

// Initialize Supabase
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Initialize Resend
const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    const statusUrl = req.query.url;
    if (!statusUrl) {
      console.error('Missing Easypaisa status URL');
      return res.status(200).send('OK');
    }

    const credentials = Buffer.from(
      `${process.env.EP_USERNAME}:${process.env.EP_PASSWORD}`
    ).toString('base64');

    // Fetch Easypaisa payment status
    const epResponse = await fetch(statusUrl, {
      method: 'GET',
      headers: {
        Credentials: credentials,
      },
    });

    if (!epResponse.ok) {
      console.error('Status fetch failed:', epResponse.status);
      return res.status(200).send('OK');
    }

    // Read as text for logging
    const rawText = await epResponse.text();
    console.log('Easypaisa raw response:', rawText);

    // Parse JSON safely
    let result;
    try {
      result = JSON.parse(rawText);
    } catch (parseErr) {
      console.error('Failed to parse Easypaisa response as JSON:', parseErr);
      return res.status(200).send('OK');
    }

    const orderId = result.order_id;
    const responseCode = result.response_code;
    const responseDesc = result.description;
    const transactionId = result.transaction_id;
    const transactionStatus = result.transaction_status;

    if (!orderId) {
      console.error('No orderId in Easypaisa response');
      return res.status(200).send('OK');
    }

    // Fetch pending payment
    const { data: record, error: fetchError } = await supabase
      .from('pending_payments')
      .select('*')
      .eq('order_id', orderId)
      .single();

    if (fetchError || !record) {
      console.error('Order not found:', orderId);
      return res.status(200).send('OK');
    }

    // Prevent duplicate processing
    if (record.status === 'success') {
      return res.status(200).send('OK');
    }

    const isSuccess =
      responseCode === '0000' &&
      (transactionStatus === 'PAID' || transactionStatus === 'SUCCESS');

    // Update payment record
    await supabase
      .from('pending_payments')
      .update({
        status: isSuccess ? 'success' : 'failed',
        error_message: isSuccess ? null : responseDesc,
      })
      .eq('order_id', orderId);

    if (isSuccess && record.user_id) {
      const days = parseInt(record.validity) || 30;
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + days);

      // Update user profile
      await supabase
        .from('profiles')
        .update({
          plan: record.plan_name || 'premium',
          plan_expiry_date: expiryDate.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', record.user_id);

      // Send email confirmation
      if (record.email) {
        try {
          await resend.emails.send({
            from: 'MedisticsApp <billing@medmacs.app>',
            to: [record.email],
            subject: 'Thank you for trusting Medmacs.App',
            html: `
              <div style="background: linear-gradient(135deg, #008080 0%, #004d4d 100%); padding: 40px 20px; font-family: sans-serif; display: flex; justify-content: center;">
                  <div style="max-width: 500px; width: 100%; background: white; border-radius: 20px; overflow: hidden; box-shadow: 0 15px 35px rgba(0,0,0,0.2);">
                      <div style="background: rgba(0, 128, 128, 0.05); padding: 30px; text-align: center; border-bottom: 1px solid #eee;">
                          <img src=https://i.ibb.co/5WnFfB51/icon-1.png" alt="Medmacs Logo" style="width: 80px; height: auto; margin-bottom: 15px;">
                          <h2 style="color: #006666; margin: 0; font-size: 24px; letter-spacing: 0.5px;">Payment Successful</h2>
                      </div>
                      <div style="padding: 30px; color: #333; line-height: 1.6;">
                          <p>Hi there,</p>
                          <p>Your subscription is now confirmed!</p>
                          <div style="background: #f4fdfd; border-radius: 12px; padding: 20px; border: 1px solid #d1eded; margin: 20px 0;">
                              <p style="margin: 0; color: #666;">Active Plan:</p>
                              <p style="margin: 0 0 15px 0; font-size: 18px; color: #008080; font-weight: bold;">${record.plan_name}</p>
                                <table style="width: 100%; font-size: 14px;">
                                    <tr><td>Order ID</td><td style="text-align: right; font-weight: bold;">${orderId}</td></tr>
                                    <tr><td>Transaction ID</td><td style="text-align: right;">${transactionId ?? '-'}</td></tr>
                                    <tr><td>Valid Until</td><td style="text-align: right; font-weight: bold; color: #e67e22;">${expiryDate.toLocaleDateString()}</td></tr>
                                </table>
                          </div>
                          <p>Warm regards,<br><strong>Team Medmacs</strong></p>
                      </div>
                  </div>
              </div>            `,
          });
        } catch (mailErr) {
          console.error('Email error:', mailErr);
        }
      }
    }

    return res.status(200).json({ status: 'acknowledged' });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(200).send('OK');
  }
}
