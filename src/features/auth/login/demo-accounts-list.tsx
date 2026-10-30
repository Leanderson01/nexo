"use client";

import { Collapse, Stack, Text, UnstyledButton } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";

import { ChevronDownIcon, ICON_SIZE } from "@/shared/icons";
import { DEMO_ACCOUNTS } from "./demo-accounts";
import classes from "./login.module.css";

/** Lista discreta e recolhível das contas do seed; um clique preenche o e-mail. */
export function DemoAccounts({ onPick }: { onPick: (email: string) => void }) {
  const [opened, { toggle }] = useDisclosure(false);

  return (
    <div>
      <UnstyledButton
        className={classes.demoToggle}
        onClick={toggle}
        aria-expanded={opened}
        aria-controls="demo-accounts"
      >
        Contas de demonstração
        <ChevronDownIcon
          size={ICON_SIZE.sm}
          className={
            opened ? `${classes.demoChevron} ${classes.demoChevronOpen}` : classes.demoChevron
          }
        />
      </UnstyledButton>

      <Collapse expanded={opened}>
        <Stack id="demo-accounts" gap={2} mt="xs">
          <Text size="xs" c="dimmed" mb={4}>
            Qualquer senha funciona. Clique para preencher o e-mail.
          </Text>
          {DEMO_ACCOUNTS.map((account) => (
            <UnstyledButton
              key={account.email}
              className={classes.demoAccount}
              onClick={() => onPick(account.email)}
            >
              <Text size="sm" fw={500}>
                {account.name}{" "}
                <Text span size="xs" c="dimmed">
                  · {account.profile}
                </Text>
              </Text>
              <Text size="xs" c="dimmed">
                {account.email} — {account.scenario}
              </Text>
            </UnstyledButton>
          ))}
        </Stack>
      </Collapse>
    </div>
  );
}
