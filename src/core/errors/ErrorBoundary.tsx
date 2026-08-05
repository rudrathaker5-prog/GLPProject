import React from 'react';
import { ScrollView, Text as RNText, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Top-level crash guard. A healthcare app must never leave the user staring at
 * a white screen — if a render throws, show what happened and a way back.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Replace with your crash reporter (Sentry, Bugsnag) in production.
    console.error('Unhandled render error', error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <SafeAreaProvider>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#f4f7fb' }}>
          <ScrollView contentContainerStyle={{ padding: 24, gap: 12 }}>
            <View>
              <ErrorText size={22} weight="700">
                Something broke
              </ErrorText>
              <ErrorText>
                The app hit an unexpected error. Your data is safe — nothing was lost.
              </ErrorText>
            </View>
            <View
              style={{
                backgroundColor: '#fde3e3',
                borderRadius: 16,
                padding: 12,
              }}
            >
              <ErrorText size={13}>{error.message}</ErrorText>
            </View>
            <View
              onTouchEnd={this.reset}
              style={{
                backgroundColor: '#1a63dd',
                borderRadius: 999,
                paddingVertical: 14,
                alignItems: 'center',
              }}
            >
              <ErrorText color="#ffffff" weight="600">
                Try again
              </ErrorText>
            </View>
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }
}

/**
 * Deliberately does not use the design system — the boundary must render even
 * if a UI module is what failed.
 */
function ErrorText({
  children,
  size = 15,
  weight = '400',
  color = '#0d1b2a',
}: {
  children: React.ReactNode;
  size?: number;
  weight?: '400' | '600' | '700';
  color?: string;
}) {
  return (
    <RNText style={{ fontSize: size, fontWeight: weight, color, lineHeight: size * 1.5 }}>
      {children}
    </RNText>
  );
}
