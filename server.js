require('dotenv').config();
const express = require('express');
const Groq = require('groq-sdk');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const path = require('path');

const app = express();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

app.use(express.json());
app.use(express.static('public'));

// Repurpose route
app.post('/repurpose', async (req, res) => {
  const { content, contentType, platforms, usageCount } = req.body;
  
  if (!content) return res.status(400).json({ error: 'Content is required' });
  if (!platforms || platforms.length === 0) return res.status(400).json({ error: 'Select at least one platform' });
  if (usageCount >= 3) return res.status(429).json({ error: 'limit_exceeded', message: 'Free limit reached!' });

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{
        role: 'user',
        content: `You are a content repurposing expert. Take the following ${contentType || 'content'} and repurpose it ONLY into these selected platforms:\n\n${platforms.join('\n')}\n\nOriginal Content:\n${content}\n\nIMPORTANT: Only generate content for the platforms listed above. Format your response clearly with each section labeled.`
      }],
      max_tokens: 2000,
    });
    res.json({ success: true, repurposed: completion.choices[0].message.content });
  } catch (error) {
    res.status(500).json({ error: 'AI processing failed: ' + error.message });
  }
});

// Create Razorpay order
app.post('/create-order', async (req, res) => {
  const { currency } = req.body;
  
  // INR = 19900 paise (₹199), USD = 500 cents ($5)
  const amount = currency === 'INR' ? 19900 : 500;
  
  try {
    const order = await razorpay.orders.create({
      amount: amount,
      currency: currency || 'INR',
      receipt: 'receipt_' + Date.now(),
    });
    res.json({ success: true, order });
  } catch (error) {
    res.status(500).json({ error: 'Order creation failed: ' + error.message });
  }
});

// Verify payment
app.post('/verify-payment', async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  
  const sign = razorpay_order_id + '|' + razorpay_payment_id;
  const expectedSign = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(sign)
    .digest('hex');

  if (razorpay_signature === expectedSign) {
    res.json({ success: true, message: 'Payment verified!' });
  } else {
    res.status(400).json({ success: false, error: 'Payment verification failed' });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Repurposer running on http://localhost:${PORT}`);
});