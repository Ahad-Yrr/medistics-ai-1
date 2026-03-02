import fetch from 'node-fetch';

export default async function handler(req, res) {
  // 1. Set CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // 2. Handle Preflight (OPTIONS)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 3. Restrict to POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // 4. Standardize body parsing
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    let { amount, basketId } = body;

    if (!amount || !basketId) {
      return res.status(400).json({ error: 'Missing amount or basketId' });
    }

    const MERCHANT_ID = process.env.PAYFAST_MERCHANT_ID || '103';
    const SECURED_KEY = process.env.PAYFAST_SECURED_KEY || 'PzPx6ut-SVay7tCUMqG';

    // PayFast requires amount formatted to 2 decimal places (e.g., "2.00")
    const formattedAmount = parseFloat(amount).toFixed(2);

    const urlPostParams = new URLSearchParams();
    urlPostParams.append('MERCHANT_ID', MERCHANT_ID);
    urlPostParams.append('SECURED_KEY', SECURED_KEY);
    urlPostParams.append('BASKET_ID', basketId);
    urlPostParams.append('TXNAMT', formattedAmount);
    urlPostParams.append('CURRENCY_CODE', 'PKR');

    console.log('Requesting token for Basket:', basketId, 'Amount:', formattedAmount);

    const response = await fetch(
      'https://ipguat.apps.net.pk/Ecommerce/api/Transaction/GetAccessToken',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'CURL/PHP PayFast Example',
        },
        body: urlPostParams.toString(),
      }
    );

    const rawText = await response.text();
    console.log('PayFast raw response:', rawText);

    if (!rawText) {
      throw new Error('Empty response from PayFast');
    }

    let data;
    try {
      data = JSON.parse(rawText);
    } catch (e) {
      return res.status(502).json({
        error: 'Invalid JSON from PayFast',
        raw: rawText,
      });
    }

    // 5. Success Check
    if (data.ACCESS_TOKEN) {
      return res.status(200).json({
        ACCESS_TOKEN: data.ACCESS_TOKEN,
        MERCHANT_ID: data.MERCHANT_ID,
        GENERATED_DATE_TIME: data.GENERATED_DATE_TIME,
      });
    } else {
      return res.status(400).json({
        error: 'PayFast rejected request',
        payfast_response: data,
      });
    }

  } catch (err) {
    console.error('Checkout API crash:', err);
    return res.status(500).json({
      error: 'Internal server error',
      detail: String(err),
    });
  }
}