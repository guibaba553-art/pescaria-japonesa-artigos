-- Atualizar dados da conta robertobaba2@gmail.com
-- Telefone: removendo código do país 55, resultando em 66992117120 (11 dígitos)
UPDATE profiles 
SET 
  cpf = '04505769810',
  phone = '66992117120',
  updated_at = NOW()
WHERE id = 'e483653d-2621-4991-b055-433f7f54c755';