/** Never remove media before the database accepts deleting the product. */
export async function deleteProductSafely(
  deleteProduct: () => PromiseLike<{ error: unknown }>,
  removePhoto: () => PromiseLike<unknown>,
) {
  const { error } = await deleteProduct();
  if (error) throw error;
  await removePhoto();
}