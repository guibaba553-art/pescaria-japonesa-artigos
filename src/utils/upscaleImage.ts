/**
 * Upscale leve de imagem via Canvas 2x + sharpening.
 * Remove serrilhado (aliasing) em imagens pequenas/compressão agressiva.
 * - Faz upscale 2x com imageSmoothingQuality='high'
 * - Aplica sharpening leve por convolução para restaurar bordas
 * - Exporta JPEG com qualidade 0.92
 *
 * Útil para fotos de produto que chegam com baixa resolução ou compressão ruim.
 */
export async function upscaleImage(file: File, scale = 2): Promise<File> {
  // SVGs e GIFs animados não devem ser rasterizados
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') {
    return file;
  }

  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const img: HTMLImageElement = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });

  // Limita dimensões para não estourar memória no celular (máx 2048 de entrada)
  const maxInput = 2048;
  let srcW = img.naturalWidth;
  let srcH = img.naturalHeight;
  if (srcW > maxInput || srcH > maxInput) {
    const ratio = Math.min(maxInput / srcW, maxInput / srcH);
    srcW = Math.round(srcW * ratio);
    srcH = Math.round(srcH * ratio);
  }

  const outW = Math.round(srcW * scale);
  const outH = Math.round(srcH * scale);

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, outW, outH);

  // --- Sharpening leve por convolução ---
  const sharpenCanvas = document.createElement('canvas');
  sharpenCanvas.width = outW;
  sharpenCanvas.height = outH;
  const sCtx = sharpenCanvas.getContext('2d');
  if (!sCtx) return file;

  sCtx.drawImage(canvas, 0, 0);

  const imageData = sCtx.getImageData(0, 0, outW, outH);
  const data = imageData.data;
  const temp = new Uint8ClampedArray(data);

  // Kernel de sharpening leve (foco suave)
  const kernel = [0, -0.3, 0, -0.3, 2.2, -0.3, 0, -0.3, 0];
  const kw = 3;
  const kh = 3;
  const half = Math.floor(kw / 2);

  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let ky = 0; ky < kh; ky++) {
        for (let kx = 0; kx < kw; kx++) {
          const py = y + ky - half;
          const px = x + kx - half;
          if (py >= 0 && py < outH && px >= 0 && px < outW) {
            const idx = (py * outW + px) * 4;
            const k = kernel[ky * kw + kx];
            r += temp[idx] * k;
            g += temp[idx + 1] * k;
            b += temp[idx + 2] * k;
          }
        }
      }
      const i = (y * outW + x) * 4;
      data[i] = Math.min(255, Math.max(0, r));
      data[i + 1] = Math.min(255, Math.max(0, g));
      data[i + 2] = Math.min(255, Math.max(0, b));
      // alpha permanece inalterado (255)
    }
  }

  sCtx.putImageData(imageData, 0, 0);

  const blob: Blob = await new Promise((resolve, reject) => {
    sharpenCanvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Falha ao gerar imagem'))),
      'image/jpeg',
      0.92,
    );
  });

  const baseName = file.name.replace(/\.[^.]+$/, '');
  return new File([blob], `${baseName}-upscaled.jpg`, { type: 'image/jpeg' });
}
