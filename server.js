require('dotenv').config();
const express = require('express');
const Groq = require('groq-sdk');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const { YoutubeTranscript } = require('youtube-transcript');

const app = express();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

app.use(express.json());
app.use(express.static('public'));

// ─── URL CONTENT EXTRACTOR ───────────────────────────────────────
async function extractFromUrl(url) {
  // YouTube detection
  const ytRegex = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  const ytMatch = url.match(ytRegex);

 if (ytMatch) {
    return {
      type: 'YouTube Video',
      content: '',
      isYoutube: true,
      message: 'YouTube videos require manual transcript. Follow steps below to get it.'
    };
  }

  // Blog/URL extraction
  try {
    const response = await axios.get(url, {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const $ = cheerio.load(response.data);
    $('script, style, nav, footer, header, aside').remove();
    const text = $('article, main, .content, .post, body').first().text()
      .replace(/\s+/g, ' ').trim().slice(0, 5000);
    if (text.length < 100) throw new Error('Could not extract enough content from this URL.');
    return { type: 'Blog/Article', content: text };
  } catch (e) {
    if (e.message.includes('Could not extract')) throw e;
    throw new Error('Could not fetch this URL. Please paste the text manually.');
  }
}

// ─── REPURPOSE ROUTE ─────────────────────────────────────────────
app.post('/repurpose', async (req, res) => {
  const { content, contentType, platforms, usageCount } = req.body;

  if (!content) return res.status(400).json({ error: 'Content is required' });
  if (!platforms || platforms.length === 0) return res.status(400).json({ error: 'Select at least one platform' });
  if (usageCount >= 3) return res.status(429).json({ error: 'limit_exceeded' });

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

// ─── URL EXTRACT ROUTE ───────────────────────────────────────────
app.post('/extract-url', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });
  try {
    const result = await extractFromUrl(url);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── RAZORPAY ROUTES ─────────────────────────────────────────────
app.post('/create-order', async (req, res) => {
  const { currency } = req.body;
  const amount = currency === 'INR' ? 19900 : 500;
  try {
    const order = await razorpay.orders.create({
      amount, currency: currency || 'INR',
      receipt: 'receipt_' + Date.now(),
    });
    res.json({ success: true, order });
  } catch (error) {
    res.status(500).json({ error: 'Order creation failed: ' + error.message });
  }
});

app.post('/verify-payment', async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  const sign = razorpay_order_id + '|' + razorpay_payment_id;
  const expectedSign = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(sign).digest('hex');
  if (razorpay_signature === expectedSign) {
    res.json({ success: true });
  } else {
    res.status(400).json({ success: false, error: 'Verification failed' });
  }
});

// ─── FEEDBACK ROUTE ──────────────────────────────────────────────
app.post('/feedback', async (req, res) => {
  const { rating, comment, page } = req.body;
  // Log feedback (in production, save to DB later)
  console.log('FEEDBACK:', { rating, comment, page, time: new Date().toISOString() });
  res.json({ success: true, message: 'Thank you for your feedback!' });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Repurposer running on http://localhost:${PORT}`));