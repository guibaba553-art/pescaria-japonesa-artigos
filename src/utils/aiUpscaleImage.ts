/**
 * Upscale de imagem via IA (Lovable AI / Gemini Image Preview).
 * Reconstrói detalhes, remove serrilhado e artefatos JPEG.
 * Fallback para upscale via Canvas se a IA falhar.
 */
import { supabase } from '@/integrations/supabase/client';

async function fileToBase64(file: File): Promise<string> {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  return dataUrl.split(',')[1];
}

function base64ToFile(base64: string, mimeType: string, name: string): File {
  const bin = atob(base64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new File([arr], name, { type: mimeType });
}

export async function aiUpscaleImage(file: File): Promise<File> {
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') {
    return file;
  }

  const imageBase64 = await fileToBase64(file);

  const { data, error } = await supabase.functions.invoke('ai-upscale-image', {
    body: { imageBase64, mimeType: file.type || 'image/jpeg' },
  });

  if (error) throw new Error(error.message || 'Falha ao chamar IA');
  if (!data?.imageBase64) throw new Error(data?.error || 'IA não retornou imagem');

  const baseName = file.name.replace(/\.[^.]+$/, '');
  const ext = (data.mimeType || 'image/png').includes('png') ? 'png' : 'jpg';
  return base64ToFile(data.imageBase64, data.mimeType || 'image/png', `${baseName}-ai-upscaled.${ext}`);
}
