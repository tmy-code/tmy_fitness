import { describe, expect, it } from 'vitest';
import { codeDepuisNom } from './lookup.ts';

const codes = ['A', 'A16', 'B3/B', 'H/G', 'CANARD'];

describe('codeDepuisNom', () => {
  it('reads the code from the file name, whatever the extension or case', () => {
    expect(codeDepuisNom('A16.jpg', codes)).toBe('A16');
    expect(codeDepuisNom('a.PNG', codes)).toBe('A');
    expect(codeDepuisNom('canard.webp', codes)).toBe('CANARD');
  });

  it('accepts an underscore for the slash of a paired code', () => {
    expect(codeDepuisNom('B3_B.jpg', codes)).toBe('B3/B');
    expect(codeDepuisNom('H_G.jpeg', codes)).toBe('H/G');
  });

  it('returns nothing for a name that is not an Exercice', () => {
    expect(codeDepuisNom('photo-123.jpg', codes)).toBeUndefined();
    expect(codeDepuisNom('A17.jpg', codes)).toBeUndefined();
  });
});
