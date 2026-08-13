import { render } from '@testing-library/react-native';
import { evalCondition, interpolate, renderTree } from '@/plugins/renderer';

describe('interpolate', () => {
  it('substitutes dot paths', () => {
    expect(interpolate('{{item.title}} by {{item.franchise}}', { item: { title: 'X', franchise: 'G' } })).toBe('X by G');
  });
  it('renders unknown paths as empty', () => {
    expect(interpolate('a{{item.missing}}b', { item: {} })).toBe('ab');
  });
});

describe('evalCondition', () => {
  const ctx = { derived: { showProgress: true, daysLeft: 3 } };
  it('truthy', () => expect(evalCondition({ field: 'derived.showProgress', is: 'truthy' }, ctx)).toBe(true));
  it('falsy', () => expect(evalCondition({ field: 'derived.showProgress', is: 'falsy' }, ctx)).toBe(false));
  it('gt', () => expect(evalCondition({ field: 'derived.daysLeft', gt: 0 }, ctx)).toBe(true));
  it('eq string', () => expect(evalCondition({ field: 'derived.daysLeft', eq: 3 }, ctx)).toBe(true));
});

describe('renderTree', () => {
  it('hides a node whose showIf is false', () => {
    const out = renderTree({ type: 'Text', value: 'hi', showIf: { field: 'derived.showProgress', is: 'truthy' } }, { item: {}, derived: { showProgress: false } });
    expect(out).toBeNull();
  });
  it('renders an interpolated title', async () => {
    const { getByText } = await render(
      renderTree({ type: 'Title', value: '{{item.title}}' }, { item: { title: 'Arlecchino' }, derived: {} })!,
    );
    expect(getByText('Arlecchino')).toBeTruthy();
  });
});
