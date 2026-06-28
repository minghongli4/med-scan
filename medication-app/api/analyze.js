export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const { imgBase64, imgMimeType } = req.body;
    if (!imgBase64 || !imgMimeType) {
      return res.status(400).json({ error: 'Missing image data' });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: imgMimeType,
                  data: imgBase64,
                },
              },
              {
                type: 'text',
                text: `You are a pharmacist assistant. Read this prescription image carefully.
Return ONLY a valid JSON object with no markdown, no explanation, no code blocks.
Format:
{
  "ocrText": "raw text you can read from the image",
  "meds": [
    {
      "id": "unique-id",
      "name": "medicine name",
      "dosage": "e.g. 500 mg",
      "when": "e.g. 1 tablet after breakfast",
      "simple": "plain language explanation of what this medicine does and when to take it",
      "confidence": "any important warning or note for the patient",
      "pill": "tablet or capsule",
      "timeOfDay": "morning or evening or noon or bedtime"
    }
  ]
}`,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: err.error?.message || 'Anthropic API error' });
    }

    const data = await response.json();
    const raw = data.content.map(b => b.text || '').join('');
    const clean = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    return res.status(200).json(parsed);

  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
