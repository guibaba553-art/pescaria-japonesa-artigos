-- Atualizar perfil de robertobaba2@gmail.com com CPF, telefone e CEP
UPDATE profiles 
SET 
  cpf = '04505769810',
  phone = '6699211712',
  cep = '78555902',
  updated_at = NOW()
WHERE id = (SELECT id FROM auth.users WHERE email = 'robertobaba2@gmail.com');