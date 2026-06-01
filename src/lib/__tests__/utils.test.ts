import { describe, it, expect } from 'vitest';
import { sanitizeDecimalInput } from '../utils';

describe('sanitizeDecimalInput', () => {
  it('deve retornar string vazia para entrada vazia', () => {
    expect(sanitizeDecimalInput('')).toBe('');
  });

  it('deve manter números inteiros', () => {
    expect(sanitizeDecimalInput('123')).toBe('123');
  });

  it('deve manter números com 2 casas decimais', () => {
    expect(sanitizeDecimalInput('12.34')).toBe('12.34');
  });

  it('deve truncar para no máximo 2 casas decimais', () => {
    expect(sanitizeDecimalInput('12.345')).toBe('12.34');
  });

  it('deve truncar para no máximo 2 casas decimais (muitos dígitos)', () => {
    expect(sanitizeDecimalInput('99.999999')).toBe('99.99');
  });

  it('deve remover caracteres não numéricos (letras)', () => {
    expect(sanitizeDecimalInput('abc12.34def')).toBe('12.34');
  });

  it('deve remover caracteres especiais', () => {
    expect(sanitizeDecimalInput('R$ 1,234.56')).toBe('1234.56');
  });

  it('deve manter apenas o primeiro ponto decimal', () => {
    expect(sanitizeDecimalInput('12.34.56')).toBe('12.34');
  });

  it('deve lidar com múltiplos pontos', () => {
    expect(sanitizeDecimalInput('1.2.3.4.5')).toBe('1.23');
  });

  it('deve permitir ponto decimal no início (leading dot)', () => {
    expect(sanitizeDecimalInput('.5')).toBe('.5');
  });

  it('deve permitir ponto decimal no final (trailing dot)', () => {
    expect(sanitizeDecimalInput('12.')).toBe('12.');
  });

  it('deve remover sinal negativo', () => {
    expect(sanitizeDecimalInput('-12.34')).toBe('12.34');
  });

  it('deve lidar apenas com ponto decimal', () => {
    expect(sanitizeDecimalInput('.')).toBe('.');
  });

  it('deve lidar com string só de zeros', () => {
    expect(sanitizeDecimalInput('000')).toBe('000');
  });

  it('deve lidar com zero seguido de decimais', () => {
    expect(sanitizeDecimalInput('0.50')).toBe('0.50');
  });

  it('deve truncar trailing dot com decimais excedentes', () => {
    expect(sanitizeDecimalInput('12.3456')).toBe('12.34');
  });

  it('deve aceitar maxDecimals customizado (3 casas)', () => {
    expect(sanitizeDecimalInput('12.3456', 3)).toBe('12.345');
  });

  it('deve aceitar maxDecimals customizado (0 casas)', () => {
    expect(sanitizeDecimalInput('12.34', 0)).toBe('12');
  });

  it('deve converter vírgula (,) para ponto (.) como separador decimal', () => {
    expect(sanitizeDecimalInput('12,34')).toBe('12.34');
  });

  it('deve converter primeira vírgula e remover vírgulas extras', () => {
    expect(sanitizeDecimalInput('1,234,56')).toBe('1.23');
  });

  it('deve converter vírgula trailing (12,) em ponto trailing (12.)', () => {
    expect(sanitizeDecimalInput('12,')).toBe('12.');
  });

  it('deve converter vírgula leading (,5) em ponto leading (.5)', () => {
    expect(sanitizeDecimalInput(',5')).toBe('.5');
  });

  it('deve lidar com input que já tem ponto e vírgulas (formato brasileiro colado)', () => {
    // 1.234,56 → dot existe, vírgula é decimal → convertida
    expect(sanitizeDecimalInput('1.234,56')).toBe('1.23');
  });
});
