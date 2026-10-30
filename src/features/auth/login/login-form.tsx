"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import {
  Alert,
  Anchor,
  Button,
  Checkbox,
  Divider,
  Group,
  PasswordInput,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { ArrowRightIcon, EyeIcon, EyeOffIcon, MailIcon, PasswordIcon } from "@/shared/icons";
import { describeSignInError, normalizeEmail, validateCorporateEmail } from "../email-validation";
import { saveRememberMePreference } from "../remember-me";
import { safeNextPath } from "../route-access";
import { DemoAccounts } from "./demo-accounts-list";
import classes from "./login.module.css";

/** O `?next=` que o proxy pôs na URL, se for um caminho interno. */
function readNextPathFromUrl(): string | null {
  return safeNextPath(new URLSearchParams(window.location.search).get("next"));
}

export function LoginForm() {
  const { signIn } = useAuthActions();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [showForgotPasswordHint, setShowForgotPasswordHint] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function validate(): boolean {
    const nextEmailError = validateCorporateEmail(email);
    const nextPasswordError = password ? null : "Digite sua senha.";
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    return !nextEmailError && !nextPasswordError;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    if (!validate()) return;

    setIsSubmitting(true);
    saveRememberMePreference(rememberMe);
    try {
      await signIn("credentials", { email: normalizeEmail(email), password });
      // Volta para onde a pessoa ia; sem destino, o proxy leva "/" à área do papel.
      router.replace(readNextPathFromUrl() ?? "/");
    } catch (error) {
      const { field, message } = describeSignInError(error);
      if (field === "email") setEmailError(message);
      else setFormError(message);
      setIsSubmitting(false);
    }
  }

  function fillDemoAccount(demoEmail: string) {
    setEmail(demoEmail);
    // Qualquer senha serve na demonstração; preencher poupa um passo.
    if (!password) setPassword("demonstracao");
    setEmailError(null);
    setPasswordError(null);
    setFormError(null);
  }

  return (
    <form className={classes.form} onSubmit={handleSubmit} noValidate>
      {/* Espaços medidos no print, por isso cada bloco tem a sua margem. */}
      <Stack gap={0}>
        <div>
          <h2 className={classes.formTitle}>Entrar</h2>
          <Text size="lg" c="dimmed" mt={8}>
            Use seu e-mail corporativo e a senha da rede Nexo.
          </Text>
        </div>

        {formError && (
          <Alert color="red" variant="light" role="alert" mt="lg">
            {formError}
          </Alert>
        )}

        <TextInput
          label="E-mail corporativo"
          placeholder="nome.sobrenome@nexo.com.br"
          type="email"
          size="lg"
          mt={26}
          classNames={{ input: classes.fieldInput }}
          styles={{ label: { marginBottom: 8 } }}
          autoComplete="username"
          leftSection={<MailIcon />}
          value={email}
          onChange={(event) => {
            setEmail(event.currentTarget.value);
            setEmailError(null);
          }}
          error={emailError}
          disabled={isSubmitting}
        />

        <div style={{ marginTop: 18 }}>
          <Group justify="space-between" mb={6}>
            <Text component="label" htmlFor="login-password" size="sm" fw={500}>
              Senha
            </Text>
            <Anchor
              component="button"
              type="button"
              size="sm"
              onClick={() => setShowForgotPasswordHint((shown) => !shown)}
            >
              Esqueci minha senha
            </Anchor>
          </Group>
          <PasswordInput
            id="login-password"
            size="lg"
            autoComplete="current-password"
            className={classes.passwordInput}
            classNames={{ input: classes.fieldInput }}
            leftSection={<PasswordIcon className={classes.passwordIcon} />}
            visibilityToggleIcon={({ reveal }) => (reveal ? <EyeOffIcon /> : <EyeIcon />)}
            value={password}
            onChange={(event) => {
              setPassword(event.currentTarget.value);
              setPasswordError(null);
            }}
            error={passwordError}
            disabled={isSubmitting}
          />
          {showForgotPasswordHint && (
            <Text size="xs" c="dimmed" mt={6}>
              A senha é a mesma da rede. Para redefinir, use o portal de autoatendimento ou ligue no
              ramal 4000. Nesta demonstração, qualquer senha funciona.
            </Text>
          )}
        </div>

        <Checkbox
          label="Manter conectado neste computador"
          mt={20}
          checked={rememberMe}
          onChange={(event) => setRememberMe(event.currentTarget.checked)}
          disabled={isSubmitting}
        />

        <Button
          type="submit"
          size="lg"
          mt={28}
          fullWidth
          className={classes.submit}
          loading={isSubmitting}
          rightSection={<ArrowRightIcon />}
        >
          Entrar
        </Button>

        <Divider my={28} color="gray.1" />

        <DemoAccounts onPick={fillDemoAccount} />
      </Stack>
    </form>
  );
}
