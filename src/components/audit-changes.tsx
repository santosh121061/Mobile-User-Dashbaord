import { View } from "react-native";
import type { AuditFieldChange } from "@/api/runtime";
import { Card, Label } from "./ui";
import { KeyRow } from "./details";

export function AuditChanges({ changes }: { changes: AuditFieldChange[] }) {
  if (!changes.length) return null;
  return (
    <View style={{ gap: 10 }}>
      <Label size="title" accessibilityRole="header">
        What changed
      </Label>
      {changes.map((change, index) => (
        <Card key={`${change.field}:${index}`}>
          <Label size="bodyMedium">{change.label}</Label>
          <KeyRow label="Before" value={JSON.stringify(change.before)} />
          <KeyRow label="After" value={JSON.stringify(change.after)} last />
        </Card>
      ))}
    </View>
  );
}
