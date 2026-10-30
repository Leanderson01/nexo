"use client";

import { Anchor, Button, Skeleton, Stack, Text, Title } from "@mantine/core";
import { useQuery } from "convex/react";
import { catchError, type ErrorInfo } from "next/error";
import Link from "next/link";
import { useState } from "react";

import { LOGIN_PATH } from "@/features/auth/route-access";
import { PageHeader } from "@/features/chat/chat-header";
import { api } from "../../../convex/_generated/api";
import { KeyIcon, LockIcon, MailIcon, ResetIcon } from "./icons";
import classes from "./profile.module.css";
import { PASSWORD_DESCRIPTION, passwordResetNotice } from "./profile-texts";

/** `/chat/perfil`: nome e e-mail (só leitura, a TI gerencia) e a senha. */
export function ProfileScreen() {
  return (
    <>
      <PageHeader current="Meu perfil" />
      <div className={classes.scroller}>
        <div className={classes.column}>
          <div>
            <Title order={1} fz={24} fw={600}>
              Meu perfil
            </Title>
            <Text size="sm" c="dimmed" mt={4}>
              Seus dados de acesso ao service desk de TI.
            </Text>
          </div>
          <ProfileErrorBoundary>
            <ProfileDetails />
          </ProfileErrorBoundary>
        </div>
      </div>
    </>
  );
}

function ProfileDetails() {
  const person = useQuery(api.auth.currentPerson);

  if (person === undefined) return <ProfileSkeleton />;
  if (person === null) return <PersonNotFound />;
  return (
    <>
      <section className={classes.card} aria-label="Dados de acesso">
        <div className={classes.row}>
          <span className={classes.rowLabel}>Nome</span>
          <span className={classes.rowValue}>{person.name}</span>
        </div>
        <div className={classes.row}>
          <span className={classes.rowLabel}>E-mail corporativo</span>
          <span className={classes.rowValue}>{person.email}</span>
          <span className={classes.managedBadge}>
            <LockIcon size={12} />
            Gerenciado pela TI
          </span>
        </div>
      </section>
      <PasswordCard email={person.email} />
    </>
  );
}

/**
 * SIMULADO: não existe redefinição de senha no sistema (a senha é a da rede, gerida pela TI).
 * O botão só mostra o aviso do protótipo; nenhum e-mail é enviado e nada é gravado.
 */
function PasswordCard({ email }: { email: string }) {
  const [resetRequested, setResetRequested] = useState(false);

  return (
    <section className={classes.card} aria-label="Senha">
      <div className={classes.password}>
        <span className={classes.passwordIcon}>
          <KeyIcon size={16} />
        </span>
        <div className={classes.passwordText}>
          <Text size="sm" fw={600}>
            Senha
          </Text>
          <Text size="xs" c="dimmed">
            {PASSWORD_DESCRIPTION}
          </Text>
        </div>
        <Button
          variant="default"
          size="xs"
          leftSection={<ResetIcon size={13} />}
          onClick={() => setResetRequested(true)}
        >
          Redefinir senha
        </Button>
      </div>
      {resetRequested && (
        <div className={classes.notice} role="status">
          <MailIcon size={13} />
          {passwordResetNotice(email)}
        </div>
      )}
    </section>
  );
}

function ProfileSkeleton() {
  return (
    <Stack gap={20} aria-label="Carregando seu perfil">
      <Skeleton height={112} radius={12} />
      <Skeleton height={72} radius={12} />
    </Stack>
  );
}

/** Sem pessoa: a sessão acabou entre o proxy e a consulta. */
function PersonNotFound() {
  return (
    <Stack align="center" gap="sm" py={48} ta="center" role="alert">
      <Text fw={600}>Não encontramos seus dados.</Text>
      <Text size="sm" c="dimmed">
        Sua sessão pode ter expirado.{" "}
        <Anchor component={Link} href={LOGIN_PATH} size="sm">
          Entrar de novo
        </Anchor>
      </Text>
    </Stack>
  );
}

/** Erro inesperado ao carregar (§10): mensagem amigável e "Tentar de novo", como no chat. */
function ProfileErrorFallback(_props: object, { error, retry }: ErrorInfo) {
  console.error("[perfil] erro inesperado na tela", error);
  return (
    <Stack align="center" gap="sm" py={48} ta="center" role="alert">
      <Text fw={600}>Não conseguimos carregar seu perfil.</Text>
      <Text size="sm" c="dimmed">
        Verifique sua conexão e tente de novo.
      </Text>
      <Button size="xs" onClick={() => retry()}>
        Tentar de novo
      </Button>
    </Stack>
  );
}

const ProfileErrorBoundary = catchError(ProfileErrorFallback);
