import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { AddressFields, type AddressFieldsValue } from '../AddressFields';

describe('AddressFields — renderização', () => {
  it('deve renderizar campos de CEP, número, logradouro, bairro, cidade e UF', () => {
    render(
      <AddressFields
        value={{
          cep: '',
          street: '',
          number: '',
          complement: '',
          neighborhood: '',
          city: '',
          state: '',
        }}
        onChange={() => {}}
      />
    );

    expect(screen.getByLabelText('CEP')).toBeInTheDocument();
    expect(screen.getByLabelText('Número')).toBeInTheDocument();
    expect(screen.getByLabelText('Logradouro')).toBeInTheDocument();
    expect(screen.getByLabelText('Bairro')).toBeInTheDocument();
    expect(screen.getByLabelText('Cidade')).toBeInTheDocument();
    expect(screen.getByLabelText('UF')).toBeInTheDocument();
    expect(screen.getByText('Complemento')).toBeInTheDocument();
  });

  it('deve exibir seletor de endereços salvos quando savedAddresses é fornecido', () => {
    const addresses = [
      { id: 'a1', cep: '01310100', street: 'Av. Paulista', number: '1000', complement: '', neighborhood: 'Bela Vista', city: 'São Paulo', state: 'SP' },
    ];

    render(
      <AddressFields
        value={{ cep: '', street: '', number: '', complement: '', neighborhood: '', city: '', state: '' }}
        onChange={() => {}}
        savedAddresses={addresses}
      />
    );

    expect(screen.getByText('Usar endereço salvo')).toBeInTheDocument();
    expect(screen.getByText(/Av. Paulista/)).toBeInTheDocument();
  });

  it('deve ocultar seletor de endereços salvos quando hideSavedAddresses=true', () => {
    const addresses = [
      { id: 'a1', cep: '01310100', street: 'Av. Paulista', number: '1000', complement: '', neighborhood: 'Bela Vista', city: 'São Paulo', state: 'SP' },
    ];

    render(
      <AddressFields
        value={{ cep: '', street: '', number: '', complement: '', neighborhood: '', city: '', state: '' }}
        onChange={() => {}}
        savedAddresses={addresses}
        hideSavedAddresses
      />
    );

    expect(screen.queryByText('Usar endereço salvo')).not.toBeInTheDocument();
  });
});

describe('AddressFields — valor controlado', () => {
  it('deve exibir valores fornecidos via prop value', () => {
    render(
      <AddressFields
        value={{
          cep: '01310100',
          street: 'Av. Paulista',
          number: '1000',
          complement: 'Apto 42',
          neighborhood: 'Bela Vista',
          city: 'São Paulo',
          state: 'SP',
        }}
        onChange={() => {}}
      />
    );

    expect(screen.getByDisplayValue('01310-100')).toBeInTheDocument(); // CEP formatado
    expect(screen.getByDisplayValue('Av. Paulista')).toBeInTheDocument();
    expect(screen.getByDisplayValue('1000')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Apto 42')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Bela Vista')).toBeInTheDocument();
    expect(screen.getByDisplayValue('São Paulo')).toBeInTheDocument();
    expect(screen.getByDisplayValue('SP')).toBeInTheDocument();
  });

  it('deve chamar onChange quando campo é alterado', () => {
    const onChange = vi.fn();

    render(
      <AddressFields
        value={{ cep: '', street: '', number: '', complement: '', neighborhood: '', city: '', state: '' }}
        onChange={onChange}
      />
    );

    fireEvent.change(screen.getByLabelText('Logradouro'), { target: { value: 'Rua Nova' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ street: 'Rua Nova' })
    );
  });

  it('deve formatar CEP com máscara', () => {
    const onChange = vi.fn();

    render(
      <AddressFields
        value={{ cep: '01310100', street: '', number: '', complement: '', neighborhood: '', city: '', state: '' }}
        onChange={onChange}
      />
    );

    expect(screen.getByDisplayValue('01310-100')).toBeInTheDocument();
  });

  it('deve converter UF para maiúsculas', () => {
    const onChange = vi.fn();

    render(
      <AddressFields
        value={{ cep: '', street: '', number: '', complement: '', neighborhood: '', city: '', state: 'sp' }}
        onChange={onChange}
      />
    );

    expect(screen.getByDisplayValue('SP')).toBeInTheDocument();
  });
});

describe('AddressFields — ViaCEP', () => {
  it('deve consultar ViaCEP ao digitar 8 dígitos no CEP', async () => {
    const originalFetch = globalThis.fetch;
    const mockFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({
        logradouro: 'Rua Teste',
        bairro: 'Centro',
        localidade: 'São Paulo',
        uf: 'SP',
        erro: false,
      }),
    });
    globalThis.fetch = mockFetch;

    const onChange = vi.fn();

    render(
      <AddressFields
        value={{ cep: '', street: '', number: '', complement: '', neighborhood: '', city: '', state: '' }}
        onChange={onChange}
      />
    );

    const cepInput = screen.getByLabelText('CEP');
    fireEvent.change(cepInput, { target: { value: '01310100' } });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('https://viacep.com.br/ws/01310100/json/');
    });

    globalThis.fetch = originalFetch;
  });
});

describe('AddressFields — endereços salvos', () => {
  const savedAddresses = [
    { id: 'a1', cep: '01310100', street: 'Av. Paulista', number: '1000', complement: 'Apto 42', neighborhood: 'Bela Vista', city: 'São Paulo', state: 'SP' },
  ];

  it('deve preencher campos ao selecionar um endereço salvo', () => {
    const onChange = vi.fn();

    render(
      <AddressFields
        value={{ cep: '', street: '', number: '', complement: '', neighborhood: '', city: '', state: '' }}
        onChange={onChange}
        savedAddresses={savedAddresses}
      />
    );

    const option = screen.getByText(/Av. Paulista/);
    fireEvent.click(option);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        cep: '01310100',
        street: 'Av. Paulista',
        number: '1000',
        complement: 'Apto 42',
        neighborhood: 'Bela Vista',
        city: 'São Paulo',
        state: 'SP',
      })
    );
  });

  it('deve chamar onSelectSavedAddress ao selecionar', () => {
    const onSelectSaved = vi.fn();

    render(
      <AddressFields
        value={{ cep: '', street: '', number: '', complement: '', neighborhood: '', city: '', state: '' }}
        onChange={() => {}}
        savedAddresses={savedAddresses}
        onSelectSavedAddress={onSelectSaved}
      />
    );

    const option = screen.getByText(/Av. Paulista/);
    fireEvent.click(option);

    expect(onSelectSaved).toHaveBeenCalledWith('a1');
  });
});

describe('AddressFields — desabilitado', () => {
  it('deve desabilitar inputs quando disabled=true', () => {
    render(
      <AddressFields
        value={{ cep: '', street: '', number: '', complement: '', neighborhood: '', city: '', state: '' }}
        onChange={() => {}}
        disabled
      />
    );

    const inputs = screen.getAllByRole('textbox');
    inputs.forEach(input => {
      expect(input).toBeDisabled();
    });
  });
});
