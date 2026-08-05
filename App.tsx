import './global.css';

import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AppProviders } from '@/app/providers/AppProviders';
import { RootNavigator } from '@/app/navigation/RootNavigator';
import { ErrorBoundary } from '@core/errors/ErrorBoundary';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <AppProviders>
          <RootNavigator />
        </AppProviders>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
