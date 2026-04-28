/**
 * Normaliza uma imagem de produto para um quadrado fixo (canvas branco).
 * - Mantém proporção original (sem distorção)
 * - Centraliza a imagem
 * - Preenche bordas com fundo branco
 * - Exporta como JPEG (menor + sem transparência)
 *
 * Resultado: todas as imagens de produto ficam visualmente padronizadas.
 */
export async function normalizeProductImage(
  file: File,
  size = 800,
  quality = 0.9
): Promise<File> {
  // SVGs e GIFs animados não devem ser rasterizados — devolve original
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

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;

  // Fundo branco
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  // Calcula encaixe "contain" — preserva proporção, sem cortar
  const scale = Math.min(size / img.width, size / img.height);
  const drawW = img.width * scale;
  const drawH = img.height * scale;
  const dx = (size - drawW) / 2;
  const dy = (size - drawH) / 2;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, dx, dy, drawW, drawH);

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Falha ao gerar imagem'))),
      'image/jpeg',
      quality
    );
  });

  const baseName = file.name.replace(/\.[^.]+$/, '');
  return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
}
