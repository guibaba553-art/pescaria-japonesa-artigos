import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BarcodeInput } from '../BarcodeInput';

vi.mock('@/utils/barcodeGenerator', () => ({
  generateUniqueBarcode: vi.fn(),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

describe('BarcodeInput', () => {
  it('não envia o formulário quando o leitor termina a leitura com Enter', () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());

    render(
      <form onSubmit={onSubmit}>
        <BarcodeInput value="123456" onChange={vi.fn()} />
      </form>,
    );

    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', code: 'Enter' });

    expect(onSubmit).not.toHaveBeenCalled();
  });
});