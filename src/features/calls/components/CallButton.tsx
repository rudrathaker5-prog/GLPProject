import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Button } from '@ui/components';
import { Icon } from '@ui/components/Icon';

import { placeCall, type CallKind, type CallReason } from '../api/callService';

/**
 * The one way the app dials a number.
 *
 * Calling `callNumber` directly still works and is still correct for the raw
 * OS action, but every *user-facing* call button goes through here so the call
 * is recorded without anyone having to remember to record it. A log that
 * depends on each call site opting in is a log with holes in it.
 */
export function CallButton({
  number,
  contactName,
  kind = 'doctor',
  reason = 'routine',
  label = 'Call',
  size = 'sm',
  variant,
  fullWidth = false,
  className,
}: {
  number: string | null | undefined;
  contactName?: string | null;
  kind?: CallKind;
  reason?: CallReason;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
  fullWidth?: boolean;
  className?: string;
}) {
  const queryClient = useQueryClient();

  const call = useMutation({
    mutationFn: () => placeCall({ number, contactName, kind, reason }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['callLog'] });
    },
  });

  const urgent = kind === 'emergency' || kind === 'crisis_line' || reason === 'red_flag';

  return (
    <Button
      label={label}
      size={size}
      variant={variant ?? (urgent ? 'danger' : 'primary')}
      fullWidth={fullWidth}
      className={className}
      disabled={!number}
      loading={call.isPending}
      icon={<Icon name="phone" size={size === 'lg' ? 18 : 16} color="#ffffff" />}
      // The hint names the number so a screen-reader user knows who they are
      // about to ring before the dialler takes over the screen.
      accessibilityHint={
        number ? `Dials ${number}${contactName ? `, ${contactName}` : ''}` : undefined
      }
      onPress={() => call.mutate()}
    />
  );
}
