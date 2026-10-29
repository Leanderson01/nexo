import { Center, Text, Title } from "@mantine/core";

// Página provisória do setup. O login (T2) assume esta rota.
export default function HomePage() {
  return (
    <Center h="100vh">
      <div>
        <Title order={1}>Nexo Assist</Title>
        <Text c="dimmed">Setup pronto. As telas chegam nas próximas tasks.</Text>
      </div>
    </Center>
  );
}
