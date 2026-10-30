import { Alert, Button, Group, Text } from "@mantine/core";

/** Falha do turno com texto amigável; "Tentar de novo" só quando dá para repetir (§10). */
export function ErrorBlock({
  message,
  retryable,
  onRetry,
}: {
  message: string;
  retryable: boolean;
  onRetry: () => void;
}) {
  return (
    <Alert color="red" variant="light" radius="lg" p="sm" w="100%">
      <Group justify="space-between" gap={8} wrap="nowrap">
        <Text size="sm" c="dark.7">
          {message}
        </Text>
        {retryable && (
          <Button size="xs" variant="white" color="red" onClick={onRetry}>
            Tentar de novo
          </Button>
        )}
      </Group>
    </Alert>
  );
}
