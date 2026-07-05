// 從 JS module import，確保 Vercel 一定打包（最穩健跨版本做法）
import { drugImages } from './drug_images_data.js';

const IMG_PREFIX = 'https://mcp.fda.gov.tw/insert/shapeImg/';

// 與預處理時相同的正規化邏輯（務必一致）
function normalize(s) {
  if (!s) return '';
  s = String(s).trim();
  const fw = '０１２３４５６７８９';
  const hw = '0123456789';
  for (let i = 0; i < fw.length; i++) {
    s = s.split(fw[i]).join(hw[i]);
  }
  s = s.replace(/["'\u201c\u201d\u301d\u301e\s\u3000]/g, '');
  return s;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { brandName } = req.body || {};
    if (!brandName) {
      return res.status(400).json({ error: 'Missing brandName' });
    }

    const key = normalize(brandName);
    const uuid = drugImages[key];

    // 只做精確比對：命中唯一才回傳，否則一律 null（安全紅線）
    if (uuid) {
      return res.status(200).json({ found: true, imageUrl: IMG_PREFIX + uuid });
    }
    return res.status(200).json({ found: false, imageUrl: null });

  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
