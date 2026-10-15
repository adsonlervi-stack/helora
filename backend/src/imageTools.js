// Conversão de imagem para WebP (deixa o Storage e o painel leves).
// Se o sharp não estiver disponível, devolve null e a imagem original é usada.
let sharpLib;
async function getSharp() {
  if (sharpLib !== undefined) return sharpLib;
  try {
    sharpLib = (await import("sharp")).default;
  } catch {
    sharpLib = null;
  }
  return sharpLib;
}

export async function toWebp(buffer, { maxSize = 1600, quality = 78 } = {}) {
  const sharp = await getSharp();
  if (!sharp || !buffer) return null;
  try {
    return await sharp(buffer).rotate().resize({ width: maxSize, height: maxSize, fit: "inside", withoutEnlargement: true }).webp({ quality }).toBuffer();
  } catch {
    return null;
  }
}

/** JPEG comprimido para mandar no WhatsApp (WebP vira figurinha em alguns celulares). */
export async function toJpeg(buffer, { maxSize = 1600, quality = 80 } = {}) {
  const sharp = await getSharp();
  if (!sharp || !buffer) return null;
  try {
    return await sharp(buffer).rotate().resize({ width: maxSize, height: maxSize, fit: "inside", withoutEnlargement: true }).jpeg({ quality, mozjpeg: true }).toBuffer();
  } catch {
    return null;
  }
}
