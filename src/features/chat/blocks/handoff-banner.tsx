import { Alert, Text } from "@mantine/core";

import type { HandoffReason } from "@/domain/enums";
import { handoffBannerText } from "../chat-texts";
import { HeadsetIcon } from "@/shared/icons";

/** "Transferimos para um analista: [motivo]"; fora do horário, diz quando recomeça (§3.8). */
export function HandoffBanner({
  reason,
  outOfHours,
  transferredAt,
}: {
  reason: HandoffReason;
  outOfHours: boolean;
  transferredAt: number;
}) {
  const { title, outOfHoursNote } = handoffBannerText(reason, outOfHours, transferredAt);
  return (
    <Alert color="orange" variant="light" radius="lg" p="sm" w="100%" icon={<HeadsetIcon />}>
      <Text size="sm" fw={500} c="dark.7">
        {title}
      </Text>
      {outOfHoursNote && (
        <Text size="xs" mt={4} c="dark.4">
          {outOfHoursNote}
        </Text>
      )}
    </Alert>
  );
}
