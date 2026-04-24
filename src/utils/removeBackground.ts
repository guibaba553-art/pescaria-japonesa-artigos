import { AutoModel, AutoProcessor, env, RawImage } from '@huggingface/transformers';

// Configure transformers.js para baixar modelos da Hugging Face
env.allowLocalModels = false;
env.useBrowserCache = true; // cacheia o modelo após o 1º download

// Reduzido de 1024 -> 512 para evitar Out-of-Memory em PCs/celulares mais simples
const MAX_IMAGE_DIMENSION = 512;

let modelPromise: Promise<{ model: any; processor: any }> | null = null;

/**
 * Carrega o modelo RMBG-1.4 da Briaai (modelo dedicado de remoção de fundo).
 * Resultado muito superior ao Segformer (que é de segmentação de cenas).
 */
async function getModel() {
  if (modelPromise) return modelPromise;

  modelPromise = (async () => {
    let model: any;
    let processor: any;
    // Tenta WebGPU em fp16 (metade da memória); se falhar, cai para WASM (CPU)
    try {
      model = await AutoModel.from_pretrained('briaai/RMBG-1.4', {
        device: 'webgpu',
        dtype: 'fp16',
        config: { model_type: 'custom' } as any,
      });
    } catch (e) {
      console.warn('[removeBackground] WebGPU indisponível, usando WASM (CPU):', e);
      model = await AutoModel.from_pretrained('briaai/RMBG-1.4', {
        config: { model_type: 'custom' } as any,
      });
    }
    processor = await AutoProcessor.from_pretrained('briaai/RMBG-1.4', {
      config: {
        do_normalize: true,
        do_pad: false,
        do_rescale: true,
        do_resize: true,
        image_mean: [0.5, 0.5, 0.5],
        feature_extractor_type: 'ImageFeatureExtractor',
        image_std: [1, 1, 1],
        resample: 2,
        rescale_factor: 0.00392156862745098,
        return_tensors: 'pt',
        // Tamanho de processamento do modelo (não afeta a saída final)
        size: { width: 512, height: 512 },
      } as any,
    });
    return { model, processor };
  })();

  return modelPromise;
}

function drawImageOnCanvas(image: HTMLImageElement) {
  let width = image.naturalWidth;
  let height = image.naturalHeight;

  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
    if (width > height) {
      height = Math.round((height * MAX_IMAGE_DIMENSION) / width);
      width = MAX_IMAGE_DIMENSION;
    } else {
      width = Math.round((width * MAX_IMAGE_DIMENSION) / height);
      height = MAX_IMAGE_DIMENSION;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas context');
  ctx.drawImage(image, 0, 0, width, height);
  return { canvas, ctx, width, height };
}

export const removeBackground = async (imageElement: HTMLImageElement): Promise<Blob> => {
  console.log('[removeBackground] iniciando com RMBG-1.4...');
  const { model, processor } = await getModel();

  const { canvas, ctx, width, height } = drawImageOnCanvas(imageElement);

  // Converte canvas em RawImage para o processor
  const rawImage = new RawImage(
    new Uint8ClampedArray(ctx.getImageData(0, 0, width, height).data) as any,
    width,
    height,
    4,
  );

  const { pixel_values } = await processor(rawImage);
  const { output } = await model({ input: pixel_values });

  // Output é a máscara em [1, 1, H, W] (0..1, onde 1 = primeiro plano)
  const maskRaw = await RawImage.fromTensor(output[0].mul(255).to('uint8')).resize(width, height);
  const maskData = maskRaw.data;

  // Aplica a máscara ao canvas (canal alpha)
  const imageData = ctx.getImageData(0, 0, width, height);
  for (let i = 0; i < maskData.length; i++) {
    imageData.data[i * 4 + 3] = maskData[i];
  }
  ctx.putImageData(imageData, 0, 0);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to create blob'));
      },
      'image/png',
      1.0,
    );
  });
};

export const loadImage = (file: Blob): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
};

export const loadImageFromUrl = (url: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
};
