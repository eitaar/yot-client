jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import OnboardingScreen from '../../app/onboarding';

/**
 * Mount tests for the pairing flow. The health probe and the pairing call are
 * mocked — everything else (the debounce, the stage machine, the six PIN
 * boxes) is the real screen.
 */

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn() },
}));

jest.mock('@/api/client', () => ({
  ...jest.requireActual('@/api/client'),
  probeHealth: jest.fn(),
  completePairing: jest.fn(),
}));

const { probeHealth, completePairing } = jest.requireMock('@/api/client') as {
  probeHealth: jest.Mock;
  completePairing: jest.Mock;
};

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 402, height: 874 },
  insets: { top: 58, left: 0, right: 0, bottom: 34 },
};

function renderScreen() {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <OnboardingScreen />
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  probeHealth.mockReset();
  completePairing.mockReset();
});

describe('onboarding', () => {
  it('renders the welcome hero and advances to the connect stage', async () => {
    const { getByText, getByTestId, queryByText } = await renderScreen();

    expect(getByText('One calendar,\nevery source.')).toBeTruthy();
    expect(
      getByText(
        'Connect your server and the agent turns your email and chats into calendar events.',
      ),
    ).toBeTruthy();

    await fireEvent.press(getByTestId('ob-welcome-cta'));

    expect(getByText('Enter the address of your self-hosted instance.')).toBeTruthy();
    expect(getByText('Server address')).toBeTruthy();
    expect(queryByText('One calendar,\nevery source.')).toBeNull();
  });

  it('probes the typed address and unlocks the six PIN boxes', async () => {
    probeHealth.mockResolvedValue({ ok: true, baseUrl: 'https://cal.example.com' });

    const { getByTestId, getByText } = await renderScreen();
    await fireEvent.press(getByTestId('ob-welcome-cta'));
    await fireEvent.changeText(getByTestId('ob-url-input'), 'cal.example.com');

    await waitFor(() => expect(probeHealth).toHaveBeenCalledWith('cal.example.com'), {
      timeout: 4000,
    });
    await waitFor(() =>
      expect(getByTestId('ob-connect-cta').props.accessibilityState).toMatchObject({
        disabled: false,
      }),
    );

    await fireEvent.press(getByTestId('ob-connect-cta'));

    expect(getByText('Enter your PIN')).toBeTruthy();
    // Six boxes, not the prototype's four — Yot mints 6-digit PINs.
    for (let i = 0; i < 6; i++) expect(getByTestId(`ob-pin-box-${i}`)).toBeTruthy();
    expect(getByTestId('ob-pin-cta').props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('returns to the PIN stage with a message when pairing is rejected', async () => {
    probeHealth.mockResolvedValue({ ok: true, baseUrl: 'https://cal.example.com' });
    completePairing.mockResolvedValue({
      ok: false,
      reason: 'invalid_pin',
      message: 'That PIN is invalid or expired.',
    });

    const { getByTestId, getByText } = await renderScreen();
    await fireEvent.press(getByTestId('ob-welcome-cta'));
    await fireEvent.changeText(getByTestId('ob-url-input'), 'cal.example.com');
    await waitFor(() => expect(probeHealth).toHaveBeenCalled(), { timeout: 4000 });
    await waitFor(() =>
      expect(getByTestId('ob-connect-cta').props.accessibilityState).toMatchObject({
        disabled: false,
      }),
    );
    await fireEvent.press(getByTestId('ob-connect-cta'));

    await fireEvent.changeText(getByTestId('ob-pin-input'), '123456');
    await fireEvent.press(getByTestId('ob-pin-cta'));

    await waitFor(() => expect(getByTestId('ob-pin-error')).toBeTruthy());
    expect(getByText('That PIN is invalid or expired.')).toBeTruthy();
    // Boxes cleared, so the button locks again.
    expect(getByTestId('ob-pin-cta').props.accessibilityState).toMatchObject({ disabled: true });
  });
});
