import { useEffect, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { requestCode, verifyCode } from '../src/auth/AuthProvider';
import { toUserError } from '../src/data/errors';
import { Button } from '../src/ui/Button';
import { Screen } from '../src/ui/Screen';
import { Text } from '../src/ui/Text';
import { TextField } from '../src/ui/TextField';
import { space } from '../src/ui/theme';

const RESEND_SECONDS = 60;

export default function SignIn() {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const codeInput = useRef<TextInput>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const sendCode = async () => {
    setBusy(true);
    setError(null);
    try {
      const normalized = await requestCode(email);
      setSentTo(normalized);
      setStep('code');
      setWait(RESEND_SECONDS);
      setTimeout(() => codeInput.current?.focus(), 50);
    } catch (e) {
      setError(toUserError(e).message);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (value = code) => {
    setBusy(true);
    setError(null);
    try {
      await verifyCode(sentTo, value);
      // La navegación la hace el layout al detectar la sesión.
    } catch (e) {
      setError(toUserError(e).message);
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={styles.hero}>
        <Text variant="title">OrganIO</Text>
        <Text variant="body" tone="soft">Lo que tienes entre manos, sin que se te escape.</Text>
      </View>

      {step === 'email' ? (
        <View style={styles.form}>
          <TextField
            label="Correo electrónico"
            value={email}
            onChangeText={setEmail}
            onSubmitEditing={sendCode}
            placeholder="tu@correo.com"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            inputMode="email"
            returnKeyType="send"
            autoFocus
            error={error}
            hint="Te enviaremos un código de 6 cifras. Sin contraseñas."
          />
          <Button label="Enviar código" onPress={sendCode} loading={busy} disabled={!email.trim()} />
        </View>
      ) : (
        <View style={styles.form}>
          <Text variant="body">
            Hemos enviado un código a <Text variant="heading">{sentTo}</Text>. Caduca en 10 minutos.
          </Text>
          <TextField
            ref={codeInput}
            label="Código"
            value={code}
            onChangeText={(v) => {
              const digits = v.replace(/\D/g, '').slice(0, 6);
              setCode(digits);
              if (digits.length === 6 && !busy) void confirm(digits);
            }}
            placeholder="123456"
            keyboardType="number-pad"
            inputMode="numeric"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
            error={error}
            style={styles.code}
          />
          <Button label="Entrar" onPress={() => confirm()} loading={busy} disabled={code.length !== 6} />
          <View style={styles.row}>
            <Button
              kind="ghost"
              label={wait > 0 ? `Reenviar en ${wait} s` : 'Reenviar código'}
              disabled={wait > 0 || busy}
              onPress={sendCode}
            />
            <Button
              kind="ghost"
              label="Cambiar correo"
              onPress={() => {
                setStep('email');
                setCode('');
                setError(null);
              }}
            />
          </View>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { gap: space.sm, marginTop: space.xxl, marginBottom: space.lg },
  form: { gap: space.lg },
  code: { fontSize: 24, letterSpacing: 8, textAlign: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
});
