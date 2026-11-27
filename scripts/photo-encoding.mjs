import sharp from 'sharp';

export const maxPhotoEdge = 2560;

export async function encodePhoto(input, targetBytes, maxEdge = maxPhotoEdge) {
  const { width, height } = (await sharp(input).metadata()).autoOrient;
  let edge = Math.min(maxEdge, Math.max(width, height));

  for (;;) {
    for (const quality of [87, 78, 68, 58, 48]) {
      const result = await sharp(input).autoOrient()
        .resize(edge, edge, { fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality, mozjpeg: true })
        .toBuffer({ resolveWithObject: true });
      if (result.data.length <= targetBytes) return result;
    }
    if (edge <= 32) throw new Error('无法压缩到指定大小。');
    edge = Math.max(32, Math.floor(edge * 0.78));
  }
}
