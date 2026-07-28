import { fireEvent, render } from '@testing-library/react-native';

import ListRow from '@/components/ListRow';
import SectionLabel from '@/components/SectionLabel';
import SegmentedControl from '@/components/SegmentedControl';
import Toggle from '@/components/Toggle';

/**
 * Smoke tests for the base components. Beyond checking they render, these
 * prove the Jest harness can mount Reanimated- and SVG-backed components,
 * which every later stage depends on.
 *
 * Note: in @testing-library/react-native v14 both `render` and `fireEvent` are
 * async (React 19 concurrent roots), so every call here is awaited.
 */

describe('ListRow', () => {
  it('renders title and subtitle and fires onPress', async () => {
    const onPress = jest.fn();
    const { getByText, getByTestId } = await render(
      <ListRow
        title="Design review"
        subtitle="10:00 – 11:00"
        dotColor="#E8453C"
        onPress={onPress}
        testID="row"
      />,
    );

    expect(getByText('Design review')).toBeTruthy();
    expect(getByText('10:00 – 11:00')).toBeTruthy();

    await fireEvent.press(getByTestId('row'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('SegmentedControl', () => {
  it('reports the option that was pressed', async () => {
    const onChange = jest.fn();
    const { getByText } = await render(
      <SegmentedControl
        options={['Feed', 'Ask', 'Tracking'] as const}
        value="Feed"
        onChange={onChange}
      />,
    );

    await fireEvent.press(getByText('Tracking'));
    expect(onChange).toHaveBeenCalledWith('Tracking');
  });
});

describe('Toggle', () => {
  it('toggles to the opposite value', async () => {
    const onValueChange = jest.fn();
    const { getByLabelText } = await render(
      <Toggle
        value={false}
        onValueChange={onValueChange}
        accessibilityLabel="Auto-suggestions"
      />,
    );

    await fireEvent.press(getByLabelText('Auto-suggestions'));
    expect(onValueChange).toHaveBeenCalledWith(true);
  });
});

describe('SectionLabel', () => {
  it('renders its text', async () => {
    const { getByText } = await render(<SectionLabel>Server</SectionLabel>);
    expect(getByText('Server')).toBeTruthy();
  });
});
