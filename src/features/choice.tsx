import { Chip } from "@/components/ui";

export function Choice({
  label,
  selected,
  disabled,
  onPress,
  hint,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
  hint?: string;
}) {
  return (
    <Chip
      label={label}
      selected={selected}
      disabled={disabled}
      onPress={onPress}
      hint={hint}
    />
  );
}
