import { describe, it, expect, vi } from 'vitest';
import { deleteProductSafely } from '../deleteProductSafely';

describe('deleteProductSafely', () => {
  it('keeps the photo when deletion is rejected for historical references', async () => {
    const removePhoto = vi.fn();
    const error = { message: 'Produto possui histórico de vendas' };
    await expect(deleteProductSafely(async () => ({ error }), removePhoto)).rejects.toEqual(error);
    expect(removePhoto).not.toHaveBeenCalled();
  });
  it('removes the photo only after deleting an unreferenced product', async () => {
    const calls: string[] = [];
    await deleteProductSafely(async () => { calls.push('product'); return { error: null }; }, async () => { calls.push('photo'); });
    expect(calls).toEqual(['product', 'photo']);
  });
});