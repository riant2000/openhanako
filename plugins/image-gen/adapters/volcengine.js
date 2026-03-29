// plugins/image-gen/adapters/volcengine.js

const FORMAT_TO_MIME = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

// 分辨率档位 + 长宽比 → 具体像素值查表
const SIZE_TABLE = {
  "2K": {
    "1:1": "2048x2048", "4:3": "2304x1728", "3:4": "1728x2304",
    "16:9": "2848x1600", "9:16": "1600x2848", "3:2": "2496x1664",
    "2:3": "1664x2496", "21:9": "3136x1344",
  },
  "4K": {
    "1:1": "4096x4096", "4:3": "3456x2592", "3:4": "2592x3456",
    "16:9": "4096x2304", "9:16": "2304x4096", "3:2": "3744x2496",
    "2:3": "2496x3744", "21:9": "4704x2016",
  },
};

function resolveSize(size, aspectRatio, providerDefaults) {
  const effectiveRatio = aspectRatio || providerDefaults?.aspect_ratio;
  const effectiveSize = size || providerDefaults?.size || "2K";

  if (effectiveRatio) {
    // 查表：分辨率档位 + 比例 → 像素值
    const tier = SIZE_TABLE[effectiveSize.toUpperCase()] || SIZE_TABLE["2K"];
    return tier[effectiveRatio] || effectiveSize;
  }
  return effectiveSize;
}

export const volcengineAdapter = {
  async generate({ prompt, modelId, apiKey, baseUrl, size, format, quality, aspectRatio, image, providerDefaults }) {
    const outputFormat = format || providerDefaults?.format || "png";
    const body = {
      model: modelId,
      prompt,
      response_format: "b64_json",
      output_format: outputFormat,
      size: resolveSize(size, aspectRatio, providerDefaults),
    };
    if (image) body.image = Array.isArray(image) ? image : [image];

    // Apply provider-specific defaults (watermark defaults to false)
    body.watermark = providerDefaults?.watermark ?? false;
    if (providerDefaults) {
      if (providerDefaults.guidance_scale !== undefined) body.guidance_scale = providerDefaults.guidance_scale;
      if (providerDefaults.seed !== undefined) body.seed = providerDefaults.seed;
    }

    const url = `${baseUrl.replace(/\/+$/, "")}/images/generations`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      let msg = `API error ${res.status}`;
      try {
        const err = await res.json();
        if (err.error?.message) msg = `${msg}: ${err.error.message}`;
      } catch {}
      throw new Error(msg);
    }

    const data = await res.json();
    const images = data.data || [];
    if (images.length === 0) {
      throw new Error("API returned no images");
    }

    const mimeType = FORMAT_TO_MIME[outputFormat] || "image/png";

    return {
      images: images.map((img, i) => ({
        buffer: Buffer.from(img.b64_json, "base64"),
        mimeType,
        fileName: `image-${i + 1}.${outputFormat}`,
      })),
    };
  },
};
