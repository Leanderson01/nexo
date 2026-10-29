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

import { describeSignInError, normalizeEmail, validateCorporateEmail } from "../email-validation";
import { saveRememberMePreference } from "../remember-me";
import { safeNextPath } from "../route-access";
import { DemoAccounts } from "./demo-accounts-list";
import { ArrowRightIcon, LockIcon, MailIcon } from "./icons";
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
      <Stack gap="lg">
        <div>
          <h2 className={classes.formTitle} style={{ margin: 0 }}>
            Entrar
          </h2>
          <Text size="sm" c="dimmed" mt={4}>
            Use seu e-mail corporativo e a senha da rede Nexo.
          </Text>
        </div>

        {formError && (
          <Alert color="red" variant="light" role="alert">
            {formError}
          </Alert>
        )}

        <TextInput
          label="E-mail corporativo"
          placeholder="nome.sobrenome@nexo.com.br"
          type="email"
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

        <div>
          <Group justify="space-between" mb={4}>
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
            autoComplete="current-password"
            leftSection={<LockIcon />}
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
          checked={rememberMe}
          onChange={(event) => setRememberMe(event.currentTarget.checked)}
          disabled={isSubmitting}
        />

        <Button
          type="submit"
          size="md"
          fullWidth
          loading={isSubmitting}
          rightSection={<ArrowRightIcon />}
        >
          Entrar
        </Button>

        <Divider />

        <DemoAccounts onPick={fillDemoAccount} />
      </Stack>
    </form>
  );
}
