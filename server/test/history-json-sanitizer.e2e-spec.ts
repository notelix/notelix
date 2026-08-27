import { repairUnpairedUnicodeSurrogates } from '../src/migrations/1787925600000-ScrubAnnotationHistorySecrets';

describe('Legacy history JSON repair', () => {
  it('replaces unpaired low and high surrogate escapes', () => {
    expect(repairUnpairedUnicodeSurrogates('{"value":"\\udc61"}')).toBe(
      '{"value":"\\ufffd"}',
    );
    expect(repairUnpairedUnicodeSurrogates('{"value":"\\ud83d"}')).toBe(
      '{"value":"\\ufffd"}',
    );
  });

  it('preserves valid surrogate pairs, ordinary escapes, and literal backslashes', () => {
    const json =
      '{"emoji":"\\ud83d\\ude00","letter":"\\u4e2d","literal":"\\\\udc61"}';

    expect(repairUnpairedUnicodeSurrogates(json)).toBe(json);
  });
});
