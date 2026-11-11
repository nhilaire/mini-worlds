import { Component, ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { I18nContext } from '../i18n/I18nProvider';
import { reportError } from '../telemetry/telemetry';
import { Button } from './Button';
import { ThemeContext } from './ThemeProvider';
import { font, spacing } from './theme';

type State = { failed: boolean };

// Catches render errors, reports them (if consented) and shows a fallback in the player's language instead of a blank screen.
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    reportError(error, 'render_error');
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <ThemeContext.Consumer>
        {({ colors }) => (
          <I18nContext.Consumer>
            {({ t }) => (
              <View style={[styles.container, { backgroundColor: colors.background }]}>
                <Text style={[styles.title, { color: colors.text }]}>{t.errors.title}</Text>
                <Text style={[styles.body, { color: colors.muted }]}>{t.errors.body}</Text>
                <Button label={t.errors.retry} onPress={() => this.setState({ failed: false })} />
              </View>
            )}
          </I18nContext.Consumer>
        )}
      </ThemeContext.Consumer>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.lg, justifyContent: 'center', gap: spacing.md },
  title: { fontSize: font.title, fontWeight: '700' },
  body: { fontSize: font.body },
});
