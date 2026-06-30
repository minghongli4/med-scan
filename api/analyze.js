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
        max_tokens: 4000,
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

STEP 1 — Determine timesOfDay for each medication based on frequency:
- "QD"/"once daily"/每天一次 → pick the single most appropriate time (default ["morning"] unless instructions say otherwise)
- "BID"/twice daily/每天兩次 or 早晚各一次 → ["morning", "evening"]
- "TID"/three times daily/每天三次 → ["morning", "noon", "evening"]
- "QID"/four times daily/每天四次 → ["morning", "noon", "evening", "bedtime"]
- "QHS"/at bedtime/睡前 → ["bedtime"]
timesOfDay MUST be an array containing one or more of EXACTLY these strings: "morning", "noon", "evening", "bedtime". Never leave it empty.

STEP 2 — Determine mealTiming for each medication:
Look for explicit instructions like 飯前/before meals, 飯後/after meals, 隨餐/with meals, 空腹/on empty stomach.
If the prescription does NOT explicitly state meal timing, do not guess silently — instead set mealTiming to "unspecified" and explain in mealTimingNote that the prescription label doesn't specify this and the patient should confirm with their pharmacist. Only set a specific mealTiming value (before/after/with/empty_stomach) if the prescription text or printed instructions explicitly say so.
mealTiming MUST be exactly one of: "before", "after", "with", "empty_stomach", "unspecified".

STEP 3 — Split dosage into two parts:
- "strength": the concentration printed on the medication, e.g. "5 mg" or "500 mg" or "200 mg/mL"
- "amount": how much to actually take each time, e.g. "1 tablet", "half tablet", "3 mL". If the prescription says 半錠, amount must say "half tablet" clearly — this is a common source of dosing errors for elderly patients, so be explicit and do not just repeat the strength.

STEP 4 — Check for interaction risk:
After reading ALL medications on the prescription, check if multiple medications share a class with known interaction risk (e.g. multiple CNS depressants/muscle relaxants/benzodiazepines/sedatives taken together can increase drowsiness and fall risk in elderly patients). If you detect this pattern, set interactionWarning at the top level of the JSON (not per medication) with a short plain-language caution and a clear instruction to confirm with a pharmacist or doctor. If no notable pattern, set interactionWarning to null. Do not provide a specific clinical recommendation — only flag the concern and direct the patient to a professional.

STEP 5 — Determine pill type:
"pill" MUST be exactly one of: "tablet", "capsule", "liquid". Use "liquid" for oral solutions, syrups, or anything measured in mL/cc.

Format:
{
  "ocrText": "raw text you can read from the image",
  "interactionWarning": "string caution message, or null if none detected",
  "meds": [
    {
      "id": "unique-id",
      "name": "medicine name",
      "strength": "e.g. 500 mg",
      "amount": "e.g. half tablet",
      "when": "human readable full instruction, e.g. half tablet, three times daily, after meals",
      "simple": "plain language explanation of what this medicine does and when to take it",
      "confidence": "any important warning or note specific to this medicine, or empty string",
      "pill": "tablet or capsule or liquid",
      "timesOfDay": ["morning", "evening"],
      "mealTiming": "before or after or with or empty_stomach or unspecified",
      "mealTimingNote": "explanation if mealTiming is unspecified, otherwise empty string"
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

    if (data.stop_reason === 'max_tokens') {
      return res.status(502).json({ error: '處方箋藥物較多，AI 回應內容被截斷，請重新掃描或聯絡開發者調整設定' });
    }

    const raw = data.content.map(b => b.text || '').join('');
    const clean = raw.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (parseErr) {
      return res.status(502).json({ error: 'AI 回傳格式異常，無法解析藥單內容，請重新掃描一次' });
    }

    return res.status(200).json(parsed);

  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
