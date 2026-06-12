require('dotenv').config();
const express = require('express');
const Groq = require('groq-sdk');
const path = require('path');

const app = express();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

app.use(express.json());
app.use(express.static('public'));

app.post('/repurpose', async (req, res) => {
  const { content, contentType, platforms } = req.body;
  
  if (!content) {
    return res.status(400).json({ error: 'Content is required' });
  }

  if (!platforms || platforms.length === 0) {
    return res.status(400).json({ error: 'Please select at least one platform' });
  }

  try {
    const platformList = platforms.join('\n');
    
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'user',
          content: `You are a content repurposing expert. Take the following ${contentType || 'content'} and repurpose it ONLY into these selected platforms:

${platformList}

Original Content:
${content}

IMPORTANT: Only generate content for the platforms listed above. Format your response clearly with each section labeled.`
        }
      ],
      max_tokens: 2000,
    });

    const response = completion.choices[0].message.content;
    res.json({ success: true, repurposed: response });

  } catch (error) {
    res.status(500).json({ error: 'AI processing failed: ' + error.message });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Repurposer running on http://localhost:${PORT}`);
});